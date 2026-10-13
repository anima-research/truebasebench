/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_DATA_BASE_URL?: string;
  readonly VITE_SOURCE_REPO_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
declare module "*.md?raw" {
  const src: string;
  export default src;
}
