import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, PenLine, List } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import {
  AdminShell,
  AdminShellBody,
  AdminShellHead,
} from "@/components/admin/AdminShell";
import { adminRailClass, blogListTone, blogStatusTone } from "@/components/admin/adminChrome";
import { SiemRail } from "@/components/siem/siemChrome";
import {
  adminApi,
  type BlogPostAdmin,
  type BlogPostWrite,
} from "@/api/admin";
import PageHeader from "@/components/layout/PageHeader";
import { useTranslation } from "react-i18next";

const emptyForm: BlogPostWrite = {
  slug: "",
  title: "",
  excerpt: "",
  body_md: "",
  locale: "id",
};

function AdminBlog() {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BlogPostWrite>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-blog-posts"],
    queryFn: () => adminApi.listBlogPosts(),
  });

  const createMut = useMutation({
    mutationFn: (body: BlogPostWrite) => adminApi.createBlogPost(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      setForm(emptyForm);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<BlogPostWrite> }) =>
      adminApi.updateBlogPost(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      setEditingId(null);
      setForm(emptyForm);
    },
  });

  const publishMut = useMutation({
    mutationFn: (id: string) => adminApi.publishBlogPost(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] }),
  });

  const unpublishMut = useMutation({
    mutationFn: (id: string) => adminApi.unpublishBlogPost(id, "draft"),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] }),
  });

  const busy =
    createMut.isPending ||
    updateMut.isPending ||
    publishMut.isPending ||
    unpublishMut.isPending;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMut.mutate({ id: editingId, body: form });
      return;
    }
    createMut.mutate(form);
  };

  const startEdit = (p: BlogPostAdmin) => {
    setEditingId(p.id);
    setForm({
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      body_md: p.body_md,
      locale: p.locale,
    });
  };

  return (
    <div className="w-full space-y-6">
      <PageHeader
        leading={<FileText className="h-6 w-6 shrink-0 text-primary" />}
        title={t("blogTitle")}
      />

      <AdminShell tone={editingId ? "warn" : "primary"} testid="blog-form-card">
        <AdminShellHead
          icon={PenLine}
          title={editingId ? t("blogEdit") : t("blogNew")}
        />
        <AdminShellBody>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="blog-slug">{t("blogSlug")}</Label>
              <Input
                id="blog-slug"
                data-testid="blog-slug"
                placeholder={t("blogSlug")}
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                required
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="blog-title">{t("blogTitleField")}</Label>
              <Input
                id="blog-title"
                data-testid="blog-title"
                placeholder={t("blogTitleField")}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="blog-excerpt">{t("blogExcerpt")}</Label>
              <Input
                id="blog-excerpt"
                data-testid="blog-excerpt"
                placeholder={t("blogExcerpt")}
                value={form.excerpt}
                onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                required
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="blog-locale">{t("blogLocale")}</Label>
              <Select
                value={form.locale}
                onValueChange={(v) =>
                  setForm({ ...form, locale: v as "id" | "en" })
                }
              >
                <SelectTrigger
                  id="blog-locale"
                  data-testid="blog-locale"
                  className="h-10 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="id">id</SelectItem>
                  <SelectItem value="en">en</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="blog-body">{t("blogBody")}</Label>
              <Textarea
                id="blog-body"
                data-testid="blog-body"
                placeholder={t("blogBody")}
                value={form.body_md}
                onChange={(e) => setForm({ ...form, body_md: e.target.value })}
                rows={10}
                required
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy} data-testid="blog-save" className="min-h-11 w-full sm:w-auto">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("save")}
              </Button>
              {editingId ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full sm:w-auto"
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyForm);
                  }}
                >
                  {t("blogCancel")}
                </Button>
              ) : null}
            </div>
          </form>
        </AdminShellBody>
      </AdminShell>

      <AdminShell
        tone={blogListTone((data?.items ?? []).map((p) => p.status))}
        testid="blog-list-shell"
      >
        <AdminShellHead icon={List} title={t("blogList")} />
        <AdminShellBody>
          {isLoading ? (
            <TableRowSkeleton rows={5} />
          ) : !data?.items.length ? (
            <div
              className="flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-6 py-8 text-center"
              data-testid="blog-empty"
            >
              <FileText className="h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium text-foreground">
                {t("blogEmpty")}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("blogSlug")}</TableHead>
                    <TableHead>{t("blogTitleField")}</TableHead>
                    <TableHead>{t("blogStatus")}</TableHead>
                    <TableHead>{t("colActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((p) => (
                    <TableRow key={p.id} className="hover:bg-muted/50">
                      <TableCell className="relative pl-4 font-mono text-xs">
                        <SiemRail
                          className={adminRailClass(blogStatusTone(p.status))}
                        />
                        {p.slug}
                      </TableCell>
                      <TableCell>{p.title}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            p.status === "published" ? "success" : "pending"
                          }
                        >
                          {p.status === "published"
                            ? t("blogPublished")
                            : t("blogDraft")}
                        </Badge>
                      </TableCell>
                      <TableCell className="space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(p)}
                        >
                          {t("blogEdit")}
                        </Button>
                        {p.status === "published" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => unpublishMut.mutate(p.id)}
                          >
                            {t("blogUnpublish")}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => publishMut.mutate(p.id)}
                          >
                            {t("blogPublish")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </AdminShellBody>
      </AdminShell>
    </div>
  );
}

export default AdminBlog;
