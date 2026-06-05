import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetContent,
  getGetContentQueryKey,
  useUpdateContent,
  useApproveContent,
  usePublishContent,
  useRejectContent,
  useRegenerateContent,
  useChatWithContent,
  getListContentQueryKey,
  getGetDashboardStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft, CheckCircle2, XCircle, Save, ExternalLink,
  Bot, Send, User, Sparkles, ChevronDown, ChevronUp, RefreshCw, Globe, Upload, Link2,
} from "lucide-react";
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
  websiteUrl: z.string().optional(),
});

type EditValues = z.infer<typeof editSchema>;

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_review: "bg-accent/20 text-accent-foreground border-accent/30",
  approved: "bg-secondary/15 text-secondary border-secondary/30",
  published: "bg-primary/10 text-primary border-primary/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  updatedFields?: string[];
  sourcesUsed?: string[];
  webSearched?: boolean;
}

const SEARCH_KEYWORDS = [
  "find", "search", "look up", "lookup", "fetch", "get", "check",
  "what is", "who is", "where is", "what are", "tell me about",
  "website", "url", "address", "latest", "current", "real", "actual",
  "correct", "verify", "confirm", "research", "information about",
];

function detectSearchIntent(msg: string): boolean {
  const lower = msg.toLowerCase();
  return SEARCH_KEYWORDS.some(k => lower.includes(k));
}

const QUICK_PROMPTS = [
  "Find the correct website URL for this business",
  "Search for the founder's background and update their bio",
  "Make the founder bio more personal and engaging",
  "Shorten the call to action to under 8 words",
  "Rewrite the business description with more SA pride",
];

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
  const [regenOpen, setRegenOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [pendingIsSearch, setPendingIsSearch] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: entry, isLoading } = useGetContent(numId, {
    query: { enabled: !!numId, queryKey: getGetContentQueryKey(numId) },
  });

  const updateContent = useUpdateContent();
  const approveContent = useApproveContent();
  const publishContent = usePublishContent();
  const rejectContent = useRejectContent();
  const regenerateContent = useRegenerateContent();
  const chatWithContent = useChatWithContent();

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
      websiteUrl: entry?.websiteUrl ?? "",
    },
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetContentQueryKey(numId) });
    queryClient.invalidateQueries({ queryKey: getListContentQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
  };

  const handleSave = (values: EditValues) => {
    updateContent.mutate({ id: numId, data: values }, {
      onSuccess: () => { invalidate(); toast({ title: "Saved as draft", description: "You can approve or reject it when ready." }); },
      onError: () => toast({ title: "Failed to save", variant: "destructive" }),
    });
  };

  const handleApprove = () => {
    approveContent.mutate({ id: numId }, {
      onSuccess: () => {
        invalidate();
        toast({ title: "Content approved", description: "Ready to publish to your Lovable site." });
      },
      onError: () => toast({ title: "Approval failed", variant: "destructive" }),
    });
  };

  const handlePublish = () => {
    publishContent.mutate({ id: numId }, {
      onSuccess: () => {
        invalidate();
        toast({ title: "Content published", description: "Pushed to Supabase successfully." });
        setLocation("/content");
      },
      onError: () => toast({ title: "Publish failed", variant: "destructive" }),
    });
  };

  const handleRegenerate = () => {
    regenerateContent.mutate({ id: numId }, {
      onSuccess: (fresh) => {
        invalidate();
        setRegenOpen(false);
        setChatMessages([]);
        toast({ title: "Content regenerated", description: `All fields refreshed for ${fresh.businessName}.` });
      },
      onError: () => toast({ title: "Regeneration failed", variant: "destructive" }),
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

  const sendChatMessage = (messageText?: string) => {
    const text = (messageText ?? chatInput).trim();
    if (!text || chatWithContent.isPending) return;

    const isSearch = detectSearchIntent(text);
    const currentValues = form.getValues();
    setChatMessages(prev => [...prev, { role: "user", text }]);
    setChatInput("");
    setPendingIsSearch(isSearch);

    chatWithContent.mutate(
      {
        id: numId,
        data: { message: text, currentContent: currentValues },
      },
      {
        onSuccess: (result) => {
          setPendingIsSearch(false);
          const updated = result.updatedFields as Record<string, string | null>;
          const changedKeys = Object.keys(updated);

          if (changedKeys.length > 0) {
            changedKeys.forEach((key) => {
              form.setValue(key as keyof EditValues, updated[key] ?? "");
            });
          }

          setChatMessages(prev => [
            ...prev,
            {
              role: "assistant",
              text: result.reply,
              updatedFields: changedKeys.length > 0 ? changedKeys : undefined,
              sourcesUsed: result.sourcesUsed ?? undefined,
              webSearched: result.webSearched ?? false,
            },
          ]);
        },
        onError: () => {
          setPendingIsSearch(false);
          setChatMessages(prev => [
            ...prev,
            { role: "assistant", text: "Something went wrong. Please try again." },
          ]);
        },
      }
    );
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
  const canApprove = entry.status === "pending_review" || entry.status === "draft";
  const canPublish = entry.status === "approved";
  const canReject = canApprove || canPublish;

  const fieldLabel: Record<string, string> = {
    founderName: "Founder Name",
    founderBio: "Founder Bio",
    standoutProduct: "Standout Product",
    productDescription: "Product Description",
    businessDescription: "Business Description",
    location: "Location",
    madeInSA: "Made in SA",
    callToAction: "Call to Action",
    websiteUrl: "Website URL",
  };

  return (
    <div className="flex gap-5 items-start">
      {/* Main content column */}
      <div className="flex-1 min-w-0 space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/content")} className="h-8 w-8" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
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
            {/* Founder */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Founder</CardTitle>
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

            {/* Product */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Product</CardTitle>
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

            {/* Business & Location */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Business & Location</CardTitle>
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
                    <FormField control={form.control} name="websiteUrl" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website URL</FormLabel>
                        <FormControl><Input placeholder="https://example.co.za" {...field} data-testid="input-website-url" /></FormControl>
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
                    <ContentField label="Website URL" value={entry.websiteUrl} />
                  </>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center gap-3 pt-1 flex-wrap">
              {canEdit && (
                <Button type="submit" variant="outline" disabled={updateContent.isPending} className="gap-1.5" data-testid="button-save-content">
                  <Save className="w-4 h-4" />
                  {updateContent.isPending ? "Saving..." : "Save Changes"}
                </Button>
              )}
              {canApprove && (
                <Button type="button" onClick={handleApprove} disabled={approveContent.isPending} className="gap-1.5 bg-secondary hover:bg-secondary/90" data-testid="button-approve-content">
                  <CheckCircle2 className="w-4 h-4" />
                  {approveContent.isPending ? "Approving..." : "Approve"}
                </Button>
              )}
              {canPublish && (
                <Button type="button" onClick={handlePublish} disabled={publishContent.isPending} className="gap-1.5 bg-primary hover:bg-primary/90" data-testid="button-publish-content">
                  <Upload className="w-4 h-4" />
                  {publishContent.isPending ? "Publishing..." : "Publish to Supabase"}
                </Button>
              )}
              {canReject && (
                <Button type="button" variant="outline" onClick={() => setRejectOpen(true)} className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/5" data-testid="button-reject-content">
                  <XCircle className="w-4 h-4" />
                  Reject
                </Button>
              )}
              {canEdit && (
                <Button type="button" variant="outline" onClick={() => setRegenOpen(true)} disabled={regenerateContent.isPending} className="gap-1.5 ml-auto text-muted-foreground" data-testid="button-regenerate-content">
                  <RefreshCw className={`w-4 h-4 ${regenerateContent.isPending ? "animate-spin" : ""}`} />
                  {regenerateContent.isPending ? "Regenerating..." : "Regenerate All"}
                </Button>
              )}
            </div>
          </form>
        </Form>

        {/* Research Sources */}
        {entry.researchSources && entry.researchSources.length > 0 && (
          <Card className="shadow-sm border-muted">
            <CardHeader
              className="pb-2 pt-3 px-4 cursor-pointer select-none"
              onClick={() => setSourcesOpen(o => !o)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Research Sources
                  </span>
                  <span className="text-xs text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                    {entry.researchSources.length}
                  </span>
                </div>
                {sourcesOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
              </div>
            </CardHeader>
            {sourcesOpen && (
              <CardContent className="pt-0 px-4 pb-3">
                <p className="text-xs text-muted-foreground mb-2">
                  URLs the AI searched during content generation — use these to verify facts.
                </p>
                <ul className="space-y-1">
                  {entry.researchSources.map((url, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <Globe className="w-3 h-3 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline break-all leading-tight"
                      >
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </CardContent>
            )}
          </Card>
        )}
      </div>

      {/* AI Chat sidebar */}
      <div className="w-80 flex-shrink-0 sticky top-0">
        <Card className="shadow-sm border-primary/20">
          <CardHeader className="pb-2 cursor-pointer" onClick={() => setChatOpen(o => !o)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <CardTitle className="text-sm font-semibold">AI Assistant</CardTitle>
              </div>
              {chatOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Ask Claude to refine or look up content</p>
          </CardHeader>

          {chatOpen && (
            <>
              {/* Quick prompts */}
              {chatMessages.length === 0 && (
                <div className="px-4 pb-3 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Quick prompts</p>
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => sendChatMessage(prompt)}
                      disabled={chatWithContent.isPending}
                      className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted/50 hover:border-primary/30 transition-colors text-foreground leading-snug disabled:opacity-50"
                      data-testid="button-quick-prompt"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              {/* Messages */}
              {chatMessages.length > 0 && (
                <div className="px-4 pb-2 max-h-80 overflow-y-auto space-y-3">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                      <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5 ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        {msg.role === "user" ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3 text-primary" />}
                      </div>
                      <div className={`flex-1 space-y-1 ${msg.role === "user" ? "items-end flex flex-col" : ""}`}>
                        <div className={`text-xs rounded-lg px-3 py-2 leading-relaxed ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                          {msg.text}
                        </div>
                        {msg.updatedFields && msg.updatedFields.length > 0 && (
                          <div className="flex flex-wrap gap-1 px-1">
                            {msg.updatedFields.map(f => (
                              <span key={f} className="text-[10px] bg-secondary/10 text-secondary border border-secondary/20 rounded px-1.5 py-0.5">
                                ✓ {fieldLabel[f] ?? f}
                              </span>
                            ))}
                          </div>
                        )}
                        {msg.sourcesUsed && msg.sourcesUsed.length > 0 && (
                          <div className="flex flex-col gap-0.5 px-1 pt-0.5">
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Globe className="w-2.5 h-2.5" /> Sources used
                            </span>
                            {msg.sourcesUsed.map(src => {
                              const label = (() => { try { return new URL(src).hostname; } catch { return src.slice(0, 40); } })();
                              return (
                                <a key={src} href={src} target="_blank" rel="noopener noreferrer"
                                  className="text-[10px] text-primary underline underline-offset-2 truncate hover:text-primary/80">
                                  {label}
                                </a>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {chatWithContent.isPending && (
                    <div className="flex gap-2">
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <Bot className="w-3 h-3 text-primary" />
                      </div>
                      {pendingIsSearch ? (
                        <div className="bg-muted rounded-lg px-3 py-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Globe className="w-3 h-3 animate-pulse text-primary" />
                          Searching the web…
                        </div>
                      ) : (
                        <div className="bg-muted rounded-lg px-3 py-2 flex gap-1 items-center">
                          <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      )}
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}

              {/* Input */}
              <div className="px-4 pb-4 pt-2 border-t border-border mt-1">
                <div className="flex gap-2">
                  <Input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChatMessage()}
                    placeholder="Ask Claude anything..."
                    className="text-xs h-8"
                    disabled={chatWithContent.isPending}
                    data-testid="input-chat-message"
                  />
                  <Button
                    type="button"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                    onClick={() => sendChatMessage()}
                    disabled={!chatInput.trim() || chatWithContent.isPending}
                    data-testid="button-send-chat"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {chatMessages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setChatMessages([])}
                    className="text-[10px] text-muted-foreground hover:text-foreground mt-1.5 transition-colors"
                  >
                    Clear chat
                  </button>
                )}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Regenerate confirmation dialog */}
      <Dialog open={regenOpen} onOpenChange={setRegenOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Regenerate all content?</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              This will ask Claude to write completely fresh content for <strong className="text-foreground">{entry.businessName}</strong> — all current fields will be overwritten. Your edits and chat history will be lost.
            </p>
            <div className="rounded-lg bg-muted/50 border border-border px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What gets replaced</p>
              <p className="text-xs text-muted-foreground">Founder name &amp; bio · Standout product · Product description · Business description · Location · Made in SA statement · Call to action · Website URL</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRegenOpen(false)} disabled={regenerateContent.isPending}>Cancel</Button>
              <Button onClick={handleRegenerate} disabled={regenerateContent.isPending} className="gap-1.5" data-testid="button-confirm-regenerate">
                <RefreshCw className={`w-4 h-4 ${regenerateContent.isPending ? "animate-spin" : ""}`} />
                {regenerateContent.isPending ? "Regenerating…" : "Yes, regenerate"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Content</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason (optional)</label>
              <Textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="What should be improved or changed?" rows={3} data-testid="textarea-reject-note" />
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
