/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 開発用：書き込みの読み取りを頼むサーバー（例 http://127.0.0.1:8787/api/parse。サーバーは PARSE_API_ENABLED=1 で起動する）。Artifact の1枚の HTML では使わない。 */
  readonly VITE_PARSE_API?: string;
}
