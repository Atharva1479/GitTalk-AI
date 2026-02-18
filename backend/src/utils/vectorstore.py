import os
import logging

from dotenv import load_dotenv
from pinecone import Pinecone, ServerlessSpec  # type: ignore
from langchain_google_genai import GoogleGenerativeAIEmbeddings  # type: ignore
from langchain_pinecone import PineconeVectorStore  # type: ignore
from langchain_core.documents import Document

load_dotenv()

PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "gta-repos")
EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 1024

# Singletons
_pc: Pinecone | None = None
_embeddings: GoogleGenerativeAIEmbeddings | None = None


def _get_pinecone() -> Pinecone:
    global _pc
    if _pc is None:
        _pc = Pinecone(api_key=PINECONE_API_KEY)
    return _pc


def _get_embeddings() -> GoogleGenerativeAIEmbeddings:
    global _embeddings
    if _embeddings is None:
        _embeddings = GoogleGenerativeAIEmbeddings(
            model=EMBEDDING_MODEL,
            google_api_key=os.getenv("GEMINI_API_KEY", ""),
            output_dimensionality=EMBEDDING_DIMENSIONS,
        )
    return _embeddings


def ensure_index_exists() -> None:
    """Create the Pinecone serverless index if it doesn't already exist."""
    pc = _get_pinecone()
    existing = [idx.name for idx in pc.list_indexes()]
    if PINECONE_INDEX_NAME not in existing:
        logging.info(f"Creating Pinecone index '{PINECONE_INDEX_NAME}'...")
        pc.create_index(
            name=PINECONE_INDEX_NAME,
            dimension=EMBEDDING_DIMENSIONS,
            metric="cosine",
            spec=ServerlessSpec(cloud="aws", region="us-east-1"),
        )
        logging.info(f"Pinecone index '{PINECONE_INDEX_NAME}' created.")
    else:
        logging.info(f"Pinecone index '{PINECONE_INDEX_NAME}' already exists.")


def get_vectorstore(namespace: str) -> PineconeVectorStore:
    """Get a LangChain PineconeVectorStore wrapper for a given namespace."""
    return PineconeVectorStore(
        index_name=PINECONE_INDEX_NAME,
        embedding=_get_embeddings(),
        namespace=namespace,
        pinecone_api_key=PINECONE_API_KEY,
    )


def check_namespace_exists(namespace: str) -> bool:
    """Check if a namespace has vectors in the index."""
    pc = _get_pinecone()
    index = pc.Index(PINECONE_INDEX_NAME)
    stats = index.describe_index_stats()
    ns_map = stats.get("namespaces", {})
    return namespace in ns_map and ns_map[namespace].get("vector_count", 0) > 0


def index_repo(namespace: str, documents: list[Document]) -> None:
    """Batch upsert documents into Pinecone under the given namespace."""
    if not documents:
        logging.warning(f"No documents to index for namespace '{namespace}'")
        return

    vectorstore = get_vectorstore(namespace)
    batch_size = 100
    for i in range(0, len(documents), batch_size):
        batch = documents[i : i + batch_size]
        vectorstore.add_documents(batch)

    logging.info(
        f"Indexed {len(documents)} chunks into namespace '{namespace}'"
    )


async def query_similar(
    namespace: str, query: str, top_k: int = 20
) -> list[Document]:
    """Retrieve top-k similar documents from Pinecone."""
    vectorstore = get_vectorstore(namespace)
    results = await vectorstore.asimilarity_search(query, k=top_k)
    return results


def delete_namespace(namespace: str) -> None:
    """Delete all vectors in a namespace for re-indexing."""
    pc = _get_pinecone()
    index = pc.Index(PINECONE_INDEX_NAME)
    index.delete(delete_all=True, namespace=namespace)
    logging.info(f"Deleted namespace '{namespace}' from Pinecone index.")
