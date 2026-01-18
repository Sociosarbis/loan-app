// ======================
// PKCE 工具函数

import { ONEDRIVE_CONFIG } from "~/config";
import { OneDriveFile } from "~/types/OneDrive";

// ======================
export function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (dec) => ("0" + dec.toString(16)).slice(-2)).join(
    "",
  );
}

export async function generateCodeChallenge(verifier: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const base64Digest = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return base64Digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<{ access_token: string; refresh_token: string } | undefined> {
  const codeVerifier = sessionStorage.getItem("pkce_code_verifier");
  if (!codeVerifier) {
    throw new Error("Missing code_verifier");
  }

  const body = new URLSearchParams({
    client_id: ONEDRIVE_CONFIG.clientId,
    scope: ONEDRIVE_CONFIG.scopes.join(" "),
    code: code,
    redirect_uri: `${window.location.origin}${window.location.pathname}`,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });

  const response = await fetch(ONEDRIVE_CONFIG.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText);
  }

  return await response.json();
}

interface TokensProvider {
  accessToken: () => string | undefined;
  refreshToken: () => string | undefined;
  onRefresh: (tokens: { accessToken: string; refreshToken: string }) => void;
}

const noAccessTokenErr = new Error("no access token");
const noRefreshTokenErr = new Error("no refresh token");

export class Client {
  constructor(
    private tokensProvider: TokensProvider,
    private onAuthFailed: () => void = () => {},
  ) {}
  async fetchPage(
    url: string,
  ): Promise<{ items: OneDriveFile[]; nextLink?: string }> {
    const token = this.tokensProvider.accessToken();
    if (!token) {
      throw noAccessTokenErr;
    }
    const response = await this.fetch(url);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || "获取文件失败");
    }

    const data = await response.json();
    return {
      items: data.value || [],
      nextLink: data["@odata.nextLink"] || null,
    };
  }

  async listFiles(): Promise<{ value: OneDriveFile[] }> {
    const token = this.tokensProvider.accessToken();
    if (!token) {
      throw noAccessTokenErr;
    }
    const rootRes = await this.fetch(
      "https://graph.microsoft.com/v1.0/me/drive/root/children",
    );
    if (!rootRes.ok) throw new Error("无法访问 OneDrive 根目录");
    return await rootRes.json();
  }

  async createFolder({ name }: { name: string }): Promise<string> {
    const token = this.tokensProvider.accessToken();
    if (!token) {
      throw noAccessTokenErr;
    }
    const createRes = await this.fetch(
      "https://graph.microsoft.com/v1.0/me/drive/root/children",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          folder: {},
          "@microsoft.graph.conflictBehavior": "fail",
        }),
      },
    );
    if (!createRes.ok) {
      const err = await createRes.json();
      if (err.error?.code === "nameAlreadyExists") {
        const items = await this.listFiles();
        const folder = items.value.find((i) => i.folder && i.name === name);
        if (folder) return folder.id;
      }
      throw new Error(`创建 ${name} 文件夹失败`);
    }
    const newFolder = await createRes.json();
    return newFolder.id;
  }

  async refreshAccessToken(): Promise<{
    access_token: string;
    refresh_token: string;
  }> {
    const refreshToken = this.tokensProvider.refreshToken();
    if (!refreshToken) {
      throw noRefreshTokenErr;
    }
    const body = new URLSearchParams({
      client_id: ONEDRIVE_CONFIG.clientId,
      scope: ONEDRIVE_CONFIG.scopes.join(" "),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    try {
      const res = await fetch(ONEDRIVE_CONFIG.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body,
      });
      const data = await res.json();
      if (data.access_token) {
        return data;
      }
      this.onAuthFailed();
      throw new Error("刷新令牌失败");
    } catch (err) {
      throw err;
    }
  }

  async fetchFileMeta({ file_id }: { file_id: string }) {
    return this.fetch(`${ONEDRIVE_CONFIG.apiUrl}/me/drive/items/${file_id}`);
  }

  async putFile({
    folder_id,
    file_name,
    file_id,
    content,
  }: {
    folder_id?: string;
    file_name?: string;
    file_id?: string;
    content?: unknown;
  }) {
    return this.fetch(
      file_id
        ? `${ONEDRIVE_CONFIG.apiUrl}/me/drive/items/${file_id}/content`
        : `${ONEDRIVE_CONFIG.apiUrl}/me/drive/items/${folder_id}:/${file_name}:/content`,
      {
        method: "PUT",
        body: JSON.stringify(content),
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  async renameFile({
    file_name,
    file_id,
  }: {
    file_name: string;
    file_id: string;
  }) {
    const res = await this.fetch(
      `${ONEDRIVE_CONFIG.apiUrl}/me/drive/items/${file_id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ name: file_name }),
        headers: { "Content-Type": "application/json" },
      },
    );
    return res.ok;
  }

  async fetch(info: RequestInfo, init?: RequestInit): Promise<Response> {
    init ??= {};
    if (!init.headers) {
      init.headers = {};
    }
    const token = this.tokensProvider.accessToken();
    if (token) {
      (init.headers as Record<string, string>)["Authorization"] = token;
    }
    const res = await fetch(info, init);
    if (res.status === 401) {
      if (token) {
        const refreshToken = this.tokensProvider.refreshToken();
        if (refreshToken) {
          const res = await this.refreshAccessToken();
          this.tokensProvider.onRefresh({
            accessToken: res.access_token,
            refreshToken: res.refresh_token,
          });
          return this.fetch(info, init);
        } else {
          this.onAuthFailed();
        }
      }
    }
    return res;
  }
}
