import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Smartphone, FileWarning, Loader2, X, File, Coins } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useStartMobileScan } from "@/hooks/useScan";
import { useScanStore } from "@/store/scanStore";
import { useCreditStore } from "@/store/creditStore";

const MAX_FILE_SIZE = 500 * 1024 * 1024;

function MobileUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [platform, setPlatform] = useState<"android" | "ios">("android");
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const startMobileScan = useStartMobileScan();
  const setActiveScan = useScanStore((s) => s.setActiveScan);
  const { credits, fetchBalance, checkEligibility } = useCreditStore();

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

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
    const eligibility = await checkEligibility(scanType);
    if (!eligibility) {
      setError("Failed to check credit eligibility.");
      return;
    }
    if (!eligibility.eligible) {
      setError(`Insufficient credits. Required: ${eligibility.required_credits}, Available: ${eligibility.current_credits}`);
      return;
    }

    startMobileScan.mutate(
      { file, platform },
      {
        onSuccess: (data) => {
          setActiveScan(data.id, scanType);
          fetchBalance();
          navigate(`/scan/${data.id}`);
        },
        onError: (error) => {
          setError((error as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Failed to start scan. Check your connection.");
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
        <span className="font-mono text-xs text-muted-foreground">Available Credits</span>
        <span className="flex items-center gap-1 font-mono text-sm font-bold text-primary">
          <Coins className="h-3.5 w-3.5" />
          {credits}
        </span>
      </div>

      <div>
        <label className="mb-1.5 block font-mono text-xs font-medium text-muted-foreground">
          PLATFORM
        </label>
        <div className="flex gap-2">
          <Button
            variant={platform === "android" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setPlatform("android");
              setFile(null);
              setError("");
              if (fileRef.current) fileRef.current.value = "";
            }}
            disabled={startMobileScan.isPending}
            className="flex-1"
          >
            <Smartphone className="mr-1.5 h-4 w-4" />
            Android (.apk)
          </Button>
          <Button
            variant={platform === "ios" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setPlatform("ios");
              setFile(null);
              setError("");
              if (fileRef.current) fileRef.current.value = "";
            }}
            disabled={startMobileScan.isPending}
            className="flex-1"
          >
            <Smartphone className="mr-1.5 h-4 w-4" />
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
          onClick={() => fileRef.current?.click()}
          className={`
            flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8
            transition-all duration-200
            ${isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
            }
          `}
        >
          <Upload
            className={`mb-3 h-10 w-10 transition-colors ${isDragging ? "text-primary" : "text-muted-foreground"}`}
          />
          <p className="mb-1 font-mono text-sm text-foreground">
            Drop {platform === "android" ? ".apk" : ".ipa"} file here
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            or click to browse (max 500MB)
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-4">
          <div className="flex items-center gap-3 min-w-0">
            <File className="h-8 w-8 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="font-mono text-sm text-foreground truncate">{file.name}</p>
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
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-600/30 bg-red-600/10 px-3 py-2">
          <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <p className="font-mono text-xs text-red-400">{error}</p>
        </div>
      )}

      <Button
        onClick={handleSubmit}
        disabled={!file || startMobileScan.isPending}
        size="lg"
        className="w-full"
      >
        {startMobileScan.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ANALYZING BINARY...
          </>
        ) : (
          <>
            <Smartphone className="mr-2 h-4 w-4" />
            START MOBILE SCAN
          </>
        )}
      </Button>
    </div>
  );
}

export default MobileUpload;
