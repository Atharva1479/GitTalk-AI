interface Config {
  API_URL: string;
  HTTP_API_URL: string;
}

const productionConfig: Config = {
  API_URL: import.meta.env.VITE_API_URL || "http://127.0.0.1:8000",
  HTTP_API_URL: import.meta.env.VITE_HTTP_API_URL || "http://127.0.0.1:8000",
};

const developmentConfig: Config = {
  API_URL: "ws://localhost:8000",
  HTTP_API_URL: "http://localhost:8000",
};

const config: Config = import.meta.env.PROD ? productionConfig : developmentConfig;

export default config;