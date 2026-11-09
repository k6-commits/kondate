/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 開発用：書き込みの読み取りを頼むサーバー（例 http://localhost:8787/api/parse）。Artifact の1枚の HTML では使わない。 */
  readonly VITE_PARSE_API?: string;
}
