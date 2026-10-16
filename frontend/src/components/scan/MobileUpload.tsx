import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Upload, Smartphone, Loader2, X, File, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { useStartMobileScan } from "@/hooks/useScan";
import { useScanError } from "@/hooks/useScanError";
import { useScanStore } from "@/store/scanStore";
import { cn } from "@/lib/utils";
import { ScanError } from "./ScanError";

const MAX_FILE_SIZE = 500 * 1024 * 1024;
type ScanErrorState = { key: string; message: string } | null;
type FileErrorKey = "errMobileAndroid" | "errMobileIos" | "errMobileTooLarge";

function MobileUpload() {
  const { t } = useTranslation("scan");
  const [file, setFile] = useState<File | null>(null);
  const [platform, setPlatform] = useState<"android" | "ios">("android");
  const [error, setError] = useState<ScanErrorState>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const startMobileScan = useStartMobileScan();
  const handleScanError = useScanError();
  const setActiveScan = useScanStore((s) => s.setActiveScan);

  const validateFile = useCallback((f: File): FileErrorKey | null => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (platform === "android" && ext !== "apk" && ext !== "aab") {
      return "errMobileAndroid";
    }
    if (platform === "ios" && ext !== "ipa") {
      return "errMobileIos";
    }
    if (f.size > MAX_FILE_SIZE) {
      return "errMobileTooLarge";
    }
    return null;
  }, [platform]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      setError(null);

      const f = e.dataTransfer.files[0];
      if (!f) return;

      const validationError = validateFile(f);
      if (validationError) {
        setError({ key: validationError, message: t(validationError) });
        return;
      }
      setFile(f);
    },
    [validateFile, t],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;

    const validationError = validateFile(f);
    if (validationError) {
      setError({ key: validationError, message: t(validationError) });
      return;
    }
    setFile(f);
  };

  const handleSubmit = async () => {
    if (!file) {
      setError({ key: "errMobileNoFile", message: t("errMobileNoFile") });
      return;
    }

    const scanType = platform === "android" ? "apk" : "ipa";
    startMobileScan.mutate(
      { file, platform },
      {
        onSuccess: (data) => {
          setActiveScan(data.id, scanType);
          navigate(`/scan/${data.id}`);
        },
        onError: (err) => {
          setError({ key: "server", message: handleScanError(err) });
        },
      },
    );
  };

  const clearFile = () => {
    setFile(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const selectPlatform = (next: "android" | "ios") => {
    setPlatform(next);
    setFile(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submitDisabled = !file || startMobileScan.isPending;

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-foreground/70">
          {t("platformLabel")}
        </label>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            data-testid="platform-android"
            aria-pressed={platform === "android"}
            onClick={() => selectPlatform("android")}
            disabled={startMobileScan.isPending}
            variant={platform === "android" ? "default" : "outline"}
            className="min-h-11 flex-1"
          >
            {platform === "android" ? (
              <Check className="mr-1.5 h-4 w-4" aria-hidden />
            ) : (
              <Smartphone className="mr-1.5 h-4 w-4" aria-hidden />
            )}
            {t("platformAndroid")}
          </Button>
          <Button
            type="button"
            size="sm"
            data-testid="platform-ios"
            aria-pressed={platform === "ios"}
            onClick={() => selectPlatform("ios")}
            disabled={startMobileScan.isPending}
            variant={platform === "ios" ? "default" : "outline"}
            className="min-h-11 flex-1"
          >
            {platform === "ios" ? (
              <Check className="mr-1.5 h-4 w-4" aria-hidden />
            ) : (
              <Smartphone className="mr-1.5 h-4 w-4" aria-hidden />
            )}
            {t("platformIos")}
          </Button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={platform === "android" ? ".apk,.aab" : ".ipa"}
        onChange={handleFileSelect}
        className="hidden"
      />

      {!file ? (
        <Card
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "border-2 border-dashed shadow-none transition-all duration-200",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/40 bg-muted/30",
          )}
        >
          <CardContent className="flex min-h-[12rem] flex-col items-center justify-center pt-6">
          <Upload
            className={cn(
              "mb-3 h-10 w-10 transition-colors",
              isDragging ? "text-primary-text" : "text-muted-foreground",
            )}
          />
          <p data-testid="mobile-choose-file" className="mb-1 text-sm text-foreground">
            {t(platform === "android" ? "chooseFileAndroid" : "chooseFileIos")}
          </p>
          <p data-testid="mobile-drop-hint" className="mb-3 text-xs text-muted-foreground">
            <span className="sm:hidden">{t("dropHintMobile")}</span>
            <span className="hidden sm:inline">{t("dropHintDesktop")}</span>
            {" "}
            {t("maxSizeHint")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="mobile-browse"
            onClick={(e) => {
              e.stopPropagation();
              fileRef.current?.click();
            }}
            disabled={startMobileScan.isPending}
          >
            {t("browseFiles")}
          </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-muted/50 shadow-none">
          <CardContent className="flex items-center justify-between pt-6">
          <div className="flex min-w-0 items-center gap-3">
            <File className="h-8 w-8 shrink-0 text-primary-text" />
            <div className="min-w-0">
              <p data-testid="mobile-file-name" className="truncate font-mono text-sm text-foreground">{file.name}</p>
              <p data-testid="mobile-file-meta" className="font-mono text-xs text-muted-foreground">
                {formatSize(file.size)} &middot; .{file.name.split(".").pop()?.toUpperCase()}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={clearFile}
            disabled={startMobileScan.isPending}
            aria-label={t("clearFile")}
            data-testid="mobile-clear-file"
          >
            <X className="h-4 w-4" />
          </Button>
          </CardContent>
        </Card>
      )}

      {error && <ScanError message={error.message} errorKey={error.key} showIcon />}

      <Button
        data-testid="mobile-scan-submit"
        onClick={handleSubmit}
        disabled={submitDisabled}
        className="min-h-11 w-full"
      >
        {startMobileScan.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("analyzingBinary")}
          </>
        ) : (
          <>
            <Smartphone className="mr-2 h-4 w-4" />
            {t("startMobileScan")}
          </>
        )}
      </Button>
    </div>
  );
}

export default MobileUpload;
