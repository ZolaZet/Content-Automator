import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetContent,
  getGetContentQueryKey,
  useUpdateContent,
  useApproveContent,
  useRejectContent,
  getListContentQueryKey,
  getGetDashboardStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, CheckCircle2, XCircle, Save, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const editSchema = z.object({
  founderName: z.string().optional(),
  founderBio: z.string().optional(),
  standoutProduct: z.string().optional(),
  productDescription: z.string().optional(),
  businessDescription: z.string().optional(),
  location: z.string().optional(),
  madeInSA: z.string().optional(),
  callToAction: z.string().optional(),
});

type EditValues = z.infer<typeof editSchema>;

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_review: "bg-accent/20 text-accent-foreground border-accent/30",
  approved: "bg-secondary/15 text-secondary border-secondary/30",
  published: "bg-primary/10 text-primary border-primary/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

function ContentField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground leading-relaxed bg-muted/30 rounded-lg px-3 py-2.5">{value}</p>
    </div>
  );
}

export default function ContentDetail() {
  const { id } = useParams<{ id: string }>();
  const numId = Number(id);
  const [, setLocation] = useLocation();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: entry, isLoading } = useGetContent(numId, {
    query: { enabled: !!numId, queryKey: getGetContentQueryKey(numId) },
  });

  const updateContent = useUpdateContent();
  const approveContent = useApproveContent();
  const rejectContent = useRejectContent();

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    values: {
      founderName: entry?.founderName ?? "",
      founderBio: entry?.founderBio ?? "",
      standoutProduct: entry?.standoutProduct ?? "",
      productDescription: entry?.productDescription ?? "",
      businessDescription: entry?.businessDescription ?? "",
      location: entry?.location ?? "",
      madeInSA: entry?.madeInSA ?? "",
      callToAction: entry?.callToAction ?? "",
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetContentQueryKey(numId) });
    queryClient.invalidateQueries({ queryKey: getListContentQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
  };

  const handleSave = (values: EditValues) => {
    updateContent.mutate({ id: numId, data: values }, {
      onSuccess: () => { invalidate(); toast({ title: "Changes saved" }); },
      onError: () => toast({ title: "Failed to save", variant: "destructive" }),
    });
  };

  const handleApprove = () => {
    approveContent.mutate({ id: numId }, {
      onSuccess: () => {
        invalidate();
        toast({ title: "Content approved", description: "Ready to push to your Lovable site." });
        setLocation("/content");
      },
      onError: () => toast({ title: "Approval failed", variant: "destructive" }),
    });
  };

  const handleReject = () => {
    rejectContent.mutate({ id: numId, data: { note: rejectNote || null } }, {
      onSuccess: () => {
        invalidate();
        setRejectOpen(false);
        toast({ title: "Content rejected" });
        setLocation("/content");
      },
      onError: () => toast({ title: "Rejection failed", variant: "destructive" }),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Content not found.</p>
        <Button variant="link" onClick={() => setLocation("/content")} className="mt-2">Back to content list</Button>
      </div>
    );
  }

  const canEdit = entry.status === "pending_review" || entry.status === "draft";
  const canApprove = entry.status === "pending_review";

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/content")} className="h-8 w-8" data-testid="button-back">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold" style={{ fontFamily: "var(--app-font-serif)" }}>{entry.businessName}</h1>
            <Badge variant="outline" className={`text-xs ${STATUS_COLORS[entry.status] ?? ""}`}>{entry.status.replace("_", " ")}</Badge>
          </div>
          {entry.scheduledDate && <p className="text-xs text-muted-foreground mt-0.5">Scheduled: {entry.scheduledDate}</p>}
        </div>
        {entry.websiteUrl && (
          <a href={entry.websiteUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5" data-testid="link-business-website">
              <ExternalLink className="w-3.5 h-3.5" /> Website
            </Button>
          </a>
        )}
      </div>

      {entry.rejectionNote && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <p className="text-xs font-semibold text-destructive uppercase tracking-wide mb-0.5">Rejection Note</p>
          <p className="text-sm text-foreground">{entry.rejectionNote}</p>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Founder</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {canEdit ? (
                <>
                  <FormField control={form.control} name="founderName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Founder Name</FormLabel>
                      <FormControl><Input {...field} data-testid="input-founder-name" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="founderBio" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Founder Bio</FormLabel>
                      <FormControl><Textarea rows={3} {...field} data-testid="textarea-founder-bio" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </>
              ) : (
                <>
                  <ContentField label="Founder Name" value={entry.founderName} />
                  <ContentField label="Founder Bio" value={entry.founderBio} />
                </>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Product</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {canEdit ? (
                <>
                  <FormField control={form.control} name="standoutProduct" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Standout Product</FormLabel>
                      <FormControl><Input {...field} data-testid="input-standout-product" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="productDescription" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product Description</FormLabel>
                      <FormControl><Textarea rows={3} {...field} data-testid="textarea-product-description" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </>
              ) : (
                <>
                  <ContentField label="Standout Product" value={entry.standoutProduct} />
                  <ContentField label="Product Description" value={entry.productDescription} />
                </>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Business & Location</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {canEdit ? (
                <>
                  <FormField control={form.control} name="businessDescription" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Description</FormLabel>
                      <FormControl><Textarea rows={3} {...field} data-testid="textarea-business-description" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="location" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <FormControl><Input {...field} data-testid="input-location" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="madeInSA" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Made in SA Statement</FormLabel>
                      <FormControl><Textarea rows={2} {...field} data-testid="textarea-made-in-sa" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="callToAction" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Call to Action</FormLabel>
                      <FormControl><Input {...field} data-testid="input-call-to-action" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </>
              ) : (
                <>
                  <ContentField label="Business Description" value={entry.businessDescription} />
                  <ContentField label="Location" value={entry.location} />
                  <ContentField label="Made in SA" value={entry.madeInSA} />
                  <ContentField label="Call to Action" value={entry.callToAction} />
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center gap-3 pt-1">
            {canEdit && (
              <Button type="submit" variant="outline" disabled={updateContent.isPending} className="gap-1.5" data-testid="button-save-content">
                <Save className="w-4 h-4" />
                {updateContent.isPending ? "Saving..." : "Save Changes"}
              </Button>
            )}
            {canApprove && (
              <Button type="button" onClick={handleApprove} disabled={approveContent.isPending} className="gap-1.5 bg-secondary hover:bg-secondary/90" data-testid="button-approve-content">
                <CheckCircle2 className="w-4 h-4" />
                {approveContent.isPending ? "Approving..." : "Approve & Publish"}
              </Button>
            )}
            {canApprove && (
              <Button type="button" variant="outline" onClick={() => setRejectOpen(true)} className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/5" data-testid="button-reject-content">
                <XCircle className="w-4 h-4" />
                Reject
              </Button>
            )}
          </div>
        </form>
      </Form>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Content</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason (optional)</label>
              <Textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="What should be improved or changed?"
                rows={3}
                data-testid="textarea-reject-note"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
              <Button onClick={handleReject} disabled={rejectContent.isPending} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" data-testid="button-confirm-reject">
                {rejectContent.isPending ? "Rejecting..." : "Confirm Reject"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
