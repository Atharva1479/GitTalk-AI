import re
import logging
from pathlib import PurePosixPath

from langchain_core.documents import Document
from langchain_text_splitters import Language, RecursiveCharacterTextSplitter

CHUNK_SIZE = 2500
CHUNK_OVERLAP = 300

BINARY_EXTENSIONS = frozenset({
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg", ".webp",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".mp3", ".mp4", ".wav", ".ogg", ".webm", ".avi", ".mov",
    ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".exe", ".dll", ".so", ".dylib", ".bin",
    ".pyc", ".pyo", ".class", ".o", ".obj",
    ".db", ".sqlite", ".sqlite3",
    ".lock",
})

EXTENSION_TO_LANGUAGE: dict[str, Language] = {
    ".py": Language.PYTHON,
    ".js": Language.JS,
    ".jsx": Language.JS,
    ".ts": Language.TS,
    ".tsx": Language.TS,
    ".java": Language.JAVA,
    ".go": Language.GO,
    ".rs": Language.RUST,
    ".rb": Language.RUBY,
    ".cpp": Language.CPP,
    ".cc": Language.CPP,
    ".cxx": Language.CPP,
    ".c": Language.C,
    ".h": Language.C,
    ".hpp": Language.CPP,
    ".cs": Language.CSHARP,
    ".scala": Language.SCALA,
    ".swift": Language.SWIFT,
    ".kt": Language.KOTLIN,
    ".php": Language.PHP,
    ".md": Language.MARKDOWN,
    ".markdown": Language.MARKDOWN,
    ".tex": Language.LATEX,
    ".html": Language.HTML,
    ".htm": Language.HTML,
    ".sol": Language.SOL,
}

# Regex to match gitingest file headers like:
# ================================================
# File: path/to/file.py
# ================================================
_FILE_HEADER_RE = re.compile(
    r"^={4,}\s*\nFile:\s*(.+?)\s*\n={4,}\s*$",
    re.MULTILINE,
)


def parse_content_to_files(content: str) -> list[tuple[str, str]]:
    """Parse gitingest monolithic content string into individual (path, text) pairs."""
    splits = _FILE_HEADER_RE.split(content)
    # splits alternates: [preamble, path1, body1, path2, body2, ...]
    files: list[tuple[str, str]] = []
    for i in range(1, len(splits) - 1, 2):
        path = splits[i].strip()
        body = splits[i + 1].strip()
        if body:
            files.append((path, body))
    return files


def _is_binary(path: str) -> bool:
    return PurePosixPath(path).suffix.lower() in BINARY_EXTENSIONS


def _get_language(path: str) -> Language | None:
    return EXTENSION_TO_LANGUAGE.get(PurePosixPath(path).suffix.lower())


def chunk_repo(content: str, namespace: str) -> list[Document]:
    """Parse gitingest content into files, then chunk each file.

    Args:
        content: The monolithic gitingest content string.
        namespace: The repo namespace (owner/repo) for metadata.

    Returns:
        List of LangChain Document objects with metadata.
    """
    files = parse_content_to_files(content)
    all_chunks: list[Document] = []

    for path, text in files:
        if _is_binary(path):
            continue

        language = _get_language(path)

        if language:
            try:
                splitter = RecursiveCharacterTextSplitter.from_language(
                    language=language,
                    chunk_size=CHUNK_SIZE,
                    chunk_overlap=CHUNK_OVERLAP,
                )
            except Exception:
                splitter = RecursiveCharacterTextSplitter(
                    chunk_size=CHUNK_SIZE,
                    chunk_overlap=CHUNK_OVERLAP,
                )
        else:
            splitter = RecursiveCharacterTextSplitter(
                chunk_size=CHUNK_SIZE,
                chunk_overlap=CHUNK_OVERLAP,
            )

        chunks = splitter.split_text(text)

        for idx, chunk_text in enumerate(chunks):
            doc = Document(
                page_content=f"File: {path}\n\n{chunk_text}",
                metadata={
                    "file_path": path,
                    "language": language.value if language else "text",
                    "chunk_index": idx,
                    "namespace": namespace,
                },
            )
            all_chunks.append(doc)

    logging.info(
        f"Chunked {len(files)} files into {len(all_chunks)} chunks "
        f"for namespace '{namespace}'"
    )
    return all_chunks
