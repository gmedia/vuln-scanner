import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DollarSign, Loader2, Check } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { adminApi, type PricingItem } from "@/api/admin";

function AdminPricing() {
  const queryClient = useQueryClient();
  const [editedCosts, setEditedCosts] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const { data: pricing, isLoading } = useQuery({
    queryKey: ["admin-pricing"],
    queryFn: adminApi.getPricing,
  });

  const updatePricing = useMutation({
    mutationFn: ({ scanType, creditCost }: { scanType: string; creditCost: number }) =>
      adminApi.updatePricing(scanType, { credit_cost: creditCost }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pricing"] });
      setSaving(null);
    },
    onError: () => {
      setSaving(null);
    },
  });

  const handleCostChange = (scanType: string, value: string) => {
    const numValue = parseInt(value, 10) || 0;
    setEditedCosts((prev) => ({ ...prev, [scanType]: numValue }));
  };

  const handleSave = (item: PricingItem) => {
    const newCost = editedCosts[item.scan_type] ?? item.credit_cost;
    if (newCost === item.credit_cost) return;
    setSaving(item.scan_type);
    updatePricing.mutate({ scanType: item.scan_type, creditCost: newCost });
  };

  const hasChanges = (item: PricingItem) => {
    const editedCost = editedCosts[item.scan_type];
    return editedCost !== undefined && editedCost !== item.credit_cost;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <DollarSign className="h-6 w-6 text-primary" />
        <h2 className="text-lg font-bold tracking-wide text-foreground">
          PRICING CONFIGURATION
        </h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">
            SCAN PRICING
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : pricing?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 rounded-full bg-muted p-3">
                <DollarSign className="h-6 w-6 text-muted-foreground opacity-40" />
              </div>
              <p className="text-sm text-foreground">
                No pricing configured
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    Scan Type
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    Credit Cost
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    Updated
                  </TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pricing?.map((item) => (
                  <TableRow key={item.id} className="group">
                    <TableCell>
                      <Badge variant="default" className="text-[10px] uppercase">
                        {item.scan_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={editedCosts[item.scan_type] ?? item.credit_cost}
                        onChange={(e) => handleCostChange(item.scan_type, e.target.value)}
                        className="h-8 w-24 font-mono text-xs tabular-nums"
                      />
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {new Date(item.updated_at).toLocaleDateString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSave(item)}
                        disabled={!hasChanges(item) || saving === item.scan_type}
                        className="text-xs"
                      >
                        {saving === item.scan_type ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : hasChanges(item) ? (
                          <>
                            <Check className="h-3 w-3 mr-1" />
                            Save
                          </>
                        ) : (
                          "Saved"
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminPricing;
