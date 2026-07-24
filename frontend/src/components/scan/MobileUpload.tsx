import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Smartphone, Loader2, X, File, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useStartMobileScan } from "@/hooks/useScan";
import { useScanError } from "@/hooks/useScanError";
import { useScanCredit } from "@/hooks/useScanCredit";
import { useScanStore } from "@/store/scanStore";
import { cn } from "@/lib/utils";
import { ScanError } from "./ScanError";

const MAX_FILE_SIZE = 500 * 1024 * 1024;

function MobileUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [platform, setPlatform] = useState<"android" | "ios">("android");
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const startMobileScan = useStartMobileScan();
  const handleScanError = useScanError();
  const setActiveScan = useScanStore((s) => s.setActiveScan);
  const {
    creditDisplay,
    costPreview,
    checkAndDeduct,
    refreshAfterScan,
    eligible,
    eligibilityLoading,
  } = useScanCredit(platform === "android" ? "apk" : "ipa");

  const validateFile = useCallback((f: File): string | null => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (platform === "android" && ext !== "apk") {
      return "Invalid file type. Expected .apk for Android.";
    }
    if (platform === "ios" && ext !== "ipa") {
      return "Invalid file type. Expected .ipa for iOS.";
    }
    if (f.size > MAX_FILE_SIZE) {
      return "File too large. Maximum size is 500MB.";
    }
    return null;
  }, [platform]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      setError("");

      const f = e.dataTransfer.files[0];
      if (!f) return;

      const validationError = validateFile(f);
      if (validationError) {
        setError(validationError);
        return;
      }
      setFile(f);
    },
    [validateFile],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError("");
    const f = e.target.files?.[0];
    if (!f) return;

    const validationError = validateFile(f);
    if (validationError) {
      setError(validationError);
      return;
    }
    setFile(f);
  };

  const handleSubmit = async () => {
    if (!file) {
      setError("Please select a file to scan.");
      return;
    }

    const scanType = platform === "android" ? "apk" : "ipa";
    const { eligible: canScan, error: creditError } = await checkAndDeduct(scanType);
    if (!canScan) {
      setError(creditError!);
      return;
    }

    startMobileScan.mutate(
      { file, platform },
      {
        onSuccess: (data) => {
          setActiveScan(data.id, scanType);
          refreshAfterScan();
          navigate(`/scan/${data.id}`);
        },
        onError: (err) => {
          setError(handleScanError(err));
        },
      },
    );
  };

  const clearFile = () => {
    setFile(null);
    setError("");
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
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const submitDisabled =
    !file || startMobileScan.isPending || (!eligibilityLoading && !eligible);

  return (
    <div className="space-y-4">
      {creditDisplay}

      <div>
        <label className="mb-1.5 block font-mono text-xs font-medium text-foreground/70">
          Platform
        </label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={platform === "android"}
            onClick={() => selectPlatform("android")}
            disabled={startMobileScan.isPending}
            className={cn(
              "flex-1",
              platform === "android" &&
                "ring-2 ring-primary bg-primary/10 text-foreground",
            )}
          >
            {platform === "android" ? (
              <Check className="mr-1.5 h-4 w-4" aria-hidden />
            ) : (
              <Smartphone className="mr-1.5 h-4 w-4" aria-hidden />
            )}
            Android (.apk)
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={platform === "ios"}
            onClick={() => selectPlatform("ios")}
            disabled={startMobileScan.isPending}
            className={cn(
              "flex-1",
              platform === "ios" &&
                "ring-2 ring-primary bg-primary/10 text-foreground",
            )}
          >
            {platform === "ios" ? (
              <Check className="mr-1.5 h-4 w-4" aria-hidden />
            ) : (
              <Smartphone className="mr-1.5 h-4 w-4" aria-hidden />
            )}
            iOS (.ipa)
          </Button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={platform === "android" ? ".apk" : ".ipa"}
        onChange={handleFileSelect}
        className="hidden"
      />

      {!file ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-all duration-200",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/40 bg-muted/30",
          )}
        >
          <Upload
            className={cn(
              "mb-3 h-10 w-10 transition-colors",
              isDragging ? "text-primary" : "text-muted-foreground",
            )}
          />
          <p className="mb-1 font-mono text-sm text-foreground">
            Drop {platform === "android" ? ".apk" : ".ipa"} file here
          </p>
          <p className="mb-3 font-mono text-xs text-muted-foreground">
            or drag and drop (max 500MB)
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              fileRef.current?.click();
            }}
            disabled={startMobileScan.isPending}
          >
            Browse files
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <File className="h-8 w-8 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="truncate font-mono text-sm text-foreground">{file.name}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {formatSize(file.size)} &middot; .{file.name.split(".").pop()?.toUpperCase()}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={clearFile}
            disabled={startMobileScan.isPending}
            aria-label="Clear file"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {error && <ScanError message={error} showIcon />}

      {costPreview}

      <Button
        onClick={handleSubmit}
        disabled={submitDisabled}
        size="lg"
        className="w-full"
      >
        {startMobileScan.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Analyzing binary...
          </>
        ) : (
          <>
            <Smartphone className="mr-2 h-4 w-4" />
            Start mobile scan
          </>
        )}
      </Button>
    </div>
  );
}

export default MobileUpload;
