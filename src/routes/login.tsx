// src/components/LoginPage.jsx
import { createSignal, onMount, Show, useContext } from "solid-js";
import { ONEDRIVE_CONFIG } from "~/config";
import { AppContext } from "~/stores";
import {
  exchangeCodeForTokens,
  generateCodeChallenge,
  generateCodeVerifier,
} from "~/utils/onedrive";
import { useNavigate } from "@solidjs/router";

export default function LoginPage() {
  const [isLoading, setLoading] = createSignal(false);
  const { userStore, toastStore } = useContext(AppContext);
  const navigate = useNavigate();

  const handleLogin = async () => {
    setLoading(true);
    try {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      // 保存 verifier 到 sessionStorage（仅本次会话）
      sessionStorage.setItem("pkce_code_verifier", codeVerifier);
      const params = new URLSearchParams({
        client_id: ONEDRIVE_CONFIG.clientId,
        response_type: "code",
        redirect_uri: `${window.location.origin}${window.location.pathname}`,
        scope: ONEDRIVE_CONFIG.scopes.join(" "),
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        response_mode: "query",
      });
      window.location.href = `${
        ONEDRIVE_CONFIG.authorizeUrl
      }?${params.toString()}`;
    } catch (e) {
      toastStore.showMessage({ text: (e as Error).message, type: "error" });
      setLoading(false);
    }
  };

  onMount(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    if (code) {
      setLoading(true);
      try {
        const tokenData = await exchangeCodeForTokens(code);
        if (tokenData?.access_token) {
          userStore.setTokens({
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
          });
          // 清除 URL 参数
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );
          navigate("/list", { replace: true });
          return;
        } else {
          toastStore.showMessage({ text: "No access token", type: "error" });
        }
      } catch (e) {
        toastStore.showMessage({ type: "error", text: (e as Error).message });
      }
      setLoading(false);
    } else if (userStore.state.accessToken) {
      navigate("/list", { replace: true });
    }
  });

  return (
    <div class="flex items-center justify-center min-h-screen bg-base-200">
      <div class="card w-96 bg-base-100 shadow-xl">
        <div class="card-body">
          <h2 class="card-title text-center">登录到 OneDrive</h2>
          <button
            onClick={handleLogin}
            class="btn btn-primary mt-4"
            classList={{
              "btn-disabled": isLoading(),
            }}
          >
            <Show when={isLoading()}>
              <span class="loading loading-spinner"></span>
            </Show>
            使用 OneDrive 登录
          </button>
        </div>
      </div>
    </div>
  );
}
