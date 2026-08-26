import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
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
          }) => void;
          prompt: () => void;
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
  const { t } = useTranslation("auth");
  const loginWithGoogleToken = useAuthStore((s) => s.loginWithGoogleToken);
  const [enabled, setEnabled] = useState(false);
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);

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

  if (!enabled) {
    return null;
  }

  const onClick = async () => {
    setBusy(true);
    try {
      await loadGis();
      const id = window.google?.accounts?.id;
      if (!id) {
        setBusy(false);
        return;
      }
      id.initialize({
        client_id: clientId,
        callback: (res) => {
          const cred = res.credential;
          if (!cred) {
            setBusy(false);
            return;
          }
          void loginWithGoogleToken(cred).finally(() => setBusy(false));
        },
      });
      id.prompt();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        className="w-full text-sm"
        data-testid="google-sign-in"
        disabled={busy}
        onClick={() => void onClick()}
      >
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("googleSigningIn")}
          </>
        ) : (
          t("continueWithGoogle")
        )}
      </Button>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t("orEmail")}
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

export default GoogleSignInButton;
