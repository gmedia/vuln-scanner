import { useEffect, useRef, useState } from "react";
import { getGoogleAuthConfig } from "@/api/auth";
import { useAuthStore } from "@/store/authStore";
import { useTranslation } from "react-i18next";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string;
            callback: (res: { credential?: string }) => void;
            cancel_on_tap_outside?: boolean;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          renderButton: (
            el: HTMLElement,
            opts: {
              theme?: string;
              size?: string;
              text?: string;
              width?: number;
              locale?: string;
            },
          ) => void;
          prompt: (moment?: (n: {
            isNotDisplayed: () => boolean;
            isSkippedMoment: () => boolean;
            isDismissedMoment: () => boolean;
          }) => void) => void;
        };
      };
    };
  }
}

function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("gis-load-failed")),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("gis-load-failed"));
    document.head.appendChild(script);
  });
}

function GoogleSignInButton() {
  const { t, i18n } = useTranslation("auth");
  const loginWithGoogleToken = useAuthStore((s) => s.loginWithGoogleToken);
  const [enabled, setEnabled] = useState(false);
  const [clientId, setClientId] = useState("");
  const [gisError, setGisError] = useState("");
  const btnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void getGoogleAuthConfig()
      .then((cfg) => {
        if (!cancelled && cfg.enabled && cfg.client_id) {
          setEnabled(true);
          setClientId(cfg.client_id);
        }
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !clientId) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await loadGis();
        if (cancelled) {
          return;
        }
        const id = window.google?.accounts?.id;
        const el = btnRef.current;
        if (!id || !el) {
          setGisError(t("googleUnavailable"));
          return;
        }
        id.initialize({
          client_id: clientId,
          cancel_on_tap_outside: true,
          callback: (res) => {
            const cred = res.credential;
            if (!cred) {
              return;
            }
            void loginWithGoogleToken(cred);
          },
        });
        el.replaceChildren();
        id.renderButton(el, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          width: 320,
          locale: i18n.language === "id" ? "id" : "en",
        });
      } catch {
        if (!cancelled) {
          setGisError(t("googleUnavailable"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, clientId, loginWithGoogleToken, i18n.language, t]);

  if (!enabled) {
    return null;
  }

  return (
    <div className="space-y-3" data-testid="google-sign-in">
      <div ref={btnRef} className="flex min-h-10 justify-center" />
      {gisError ? (
        <p className="text-center text-xs text-destructive">{gisError}</p>
      ) : null}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t("orEmail")}
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

export default GoogleSignInButton;
