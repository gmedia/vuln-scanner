import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  User,
  Shield,
  Mail,
  Calendar,
  Coins,
  Loader2,
  Copy,
  Check,
  Radar,
  Send,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { adminApi } from "@/api/admin";
import { formatCredits } from "@/lib/utils";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: user, isLoading } = useQuery({
    queryKey: ["admin-user", id],
    queryFn: () => adminApi.getUserDetail(id!),
    enabled: !!id,
  });

  const updateCredits = useMutation({
    mutationFn: () =>
      adminApi.updateUserCredits(id!, {
        amount: parseInt(amount, 10),
        description: description.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setAmount("");
      setDescription("");
    },
  });

  const resendVerification = useMutation({
    mutationFn: () => adminApi.resendVerification(id!),
  });

  const handleSubmit = () => {
    const numAmount = parseInt(amount, 10);
    if (!numAmount || numAmount === 0) return;
    updateCredits.mutate();
  };

  const handleCopyEmail = async () => {
    if (!user?.email) return;
    try {
      await navigator.clipboard.writeText(user.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      void 0;
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/admin/users")}
          className="text-xs"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <User className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-lg font-bold tracking-wide text-foreground">
            User details
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Profile and credit adjustment
          </p>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          </CardContent>
        </Card>
      ) : user ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm tracking-wide">
                Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span
                  className="min-w-0 flex-1 truncate font-mono text-sm text-foreground"
                  title={user.email}
                >
                  {user.email}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyEmail}
                  className="shrink-0 text-xs"
                  title={copied ? "Copied" : "Copy email"}
                  aria-label={copied ? "Copied" : "Copy email"}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <Badge
                    variant={user.is_admin ? "completed" : "default"}
                    className="text-[10px]"
                  >
                    {user.is_admin ? "Admin" : "User"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <Badge
                    variant={user.is_verified ? "completed" : "pending"}
                    className="text-[10px]"
                  >
                    {user.is_verified ? "Verified" : "Unverified"}
                  </Badge>
                </div>
              </div>
              {!user.is_verified && (
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => resendVerification.mutate()}
                    disabled={resendVerification.isPending}
                    className="text-xs"
                  >
                    {resendVerification.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-3 w-3" />
                        Resend verification email
                      </>
                    )}
                  </Button>
                  {resendVerification.isError && (
                    <div className="rounded-md border border-red-600/30 bg-red-600/10 px-3 py-2">
                      <p className="text-xs text-red-400">
                        Failed to resend verification email
                      </p>
                    </div>
                  )}
                  {resendVerification.isSuccess &&
                    resendVerification.data?.email_sent === false && (
                      <div className="rounded-md border border-red-600/30 bg-red-600/10 px-3 py-2">
                        <p className="text-xs text-red-400">
                          {resendVerification.data.message ||
                            "Failed to send verification email. Please try again shortly."}
                        </p>
                      </div>
                    )}
                  {resendVerification.isSuccess &&
                    resendVerification.data?.email_sent !== false && (
                      <div className="rounded-md border border-green-600/30 bg-green-600/10 px-3 py-2">
                        <p className="text-xs text-green-400">
                          {resendVerification.data.message ||
                            "Verification email has been sent."}
                        </p>
                      </div>
                    )}
                </div>
              )}
              <div className="flex items-center gap-3">
                <Coins className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="font-mono text-sm tabular-nums text-primary">
                  {formatCredits(user.credits)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Radar className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums">{user.scan_count}</span> scans performed
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  Joined {formatDate(user.created_at)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm tracking-wide">
                Credit adjustment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="admin-credit-amount" className="mb-1.5 block">
                    Amount (+ or −)
                  </Label>
                  <Input
                    id="admin-credit-amount"
                    type="number"
                    placeholder="e.g. 100 or -50"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div>
                  <Label htmlFor="admin-credit-description" className="mb-1.5 block">
                    Description
                  </Label>
                  <Input
                    id="admin-credit-description"
                    type="text"
                    placeholder="Reason for adjustment..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>
              <Button
                onClick={handleSubmit}
                disabled={
                  !amount || parseInt(amount, 10) === 0 || updateCredits.isPending
                }
                className="text-xs"
              >
                {updateCredits.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Adjust credits"
                )}
              </Button>
              {updateCredits.isError && (
                <div className="rounded-md border border-red-600/30 bg-red-600/10 px-3 py-2">
                  <p className="text-xs text-red-400">
                    Failed to update credits
                  </p>
                </div>
              )}
              {updateCredits.isSuccess && (
                <div className="rounded-md border border-green-600/30 bg-green-600/10 px-3 py-2">
                  <p className="text-xs text-green-400">
                    Credits updated successfully
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              User not found
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default AdminUserDetail;
