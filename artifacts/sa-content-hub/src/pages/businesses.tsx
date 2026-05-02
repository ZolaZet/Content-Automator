import { useState } from "react";
import {
  useListBusinesses,
  useCreateBusiness,
  useUpdateBusiness,
  useDeleteBusiness,
  getListBusinessesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2, Globe, MapPin, Tag, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const businessSchema = z.object({
  name: z.string().min(1, "Name is required"),
  website: z.string().url("Must be a valid URL").or(z.literal("")).optional(),
  province: z.string().optional(),
  industry: z.string().optional(),
  notes: z.string().optional(),
});

type BusinessFormValues = z.infer<typeof businessSchema>;

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-accent/20 text-accent-foreground border-accent/30",
  published: "bg-secondary/15 text-secondary border-secondary/30",
  skipped: "bg-muted text-muted-foreground border-border",
};

const SA_PROVINCES = [
  "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal",
  "Limpopo", "Mpumalanga", "Northern Cape", "North West", "Western Cape",
];

function BusinessForm({ defaultValues, onSubmit, isLoading }: {
  defaultValues?: BusinessFormValues;
  onSubmit: (values: BusinessFormValues) => void;
  isLoading: boolean;
}) {
  const form = useForm<BusinessFormValues>({
    resolver: zodResolver(businessSchema),
    defaultValues: defaultValues ?? { name: "", website: "", province: "", industry: "", notes: "" },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Business Name *</FormLabel>
            <FormControl><Input placeholder="e.g. Ardmore Ceramic Art" {...field} data-testid="input-business-name" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="website" render={({ field }) => (
          <FormItem>
            <FormLabel>Website</FormLabel>
            <FormControl><Input placeholder="https://example.co.za" {...field} data-testid="input-business-website" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="province" render={({ field }) => (
            <FormItem>
              <FormLabel>Province</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-province"><SelectValue placeholder="Select province" /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  {SA_PROVINCES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="industry" render={({ field }) => (
            <FormItem>
              <FormLabel>Industry</FormLabel>
              <FormControl><Input placeholder="e.g. Ceramics, Food" {...field} data-testid="input-industry" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel>Notes for AI</FormLabel>
            <FormControl><Textarea placeholder="Any helpful context about this business..." rows={2} {...field} data-testid="textarea-notes" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <Button type="submit" disabled={isLoading} className="w-full" data-testid="button-submit-business">
          {isLoading ? "Saving..." : "Save Business"}
        </Button>
      </form>
    </Form>
  );
}

export default function Businesses() {
  const [addOpen, setAddOpen] = useState(false);
  const [editBusiness, setEditBusiness] = useState<{ id: number; name: string; website?: string | null; province?: string | null; industry?: string | null; notes?: string | null } | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { data: businesses, isLoading } = useListBusinesses();
  const createBusiness = useCreateBusiness();
  const updateBusiness = useUpdateBusiness();
  const deleteBusiness = useDeleteBusiness();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListBusinessesQueryKey() });

  const handleCreate = (values: BusinessFormValues) => {
    createBusiness.mutate({ data: { name: values.name, website: values.website || undefined, province: values.province || undefined, industry: values.industry || undefined, notes: values.notes || undefined } }, {
      onSuccess: () => { invalidate(); setAddOpen(false); toast({ title: "Business added" }); },
      onError: () => toast({ title: "Failed to add business", variant: "destructive" }),
    });
  };

  const handleUpdate = (values: BusinessFormValues) => {
    if (!editBusiness) return;
    updateBusiness.mutate({ id: editBusiness.id, data: { name: values.name, website: values.website || null, province: values.province || null, industry: values.industry || null, notes: values.notes || null } }, {
      onSuccess: () => { invalidate(); setEditBusiness(null); toast({ title: "Business updated" }); },
      onError: () => toast({ title: "Failed to update", variant: "destructive" }),
    });
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteBusiness.mutate({ id: deleteId }, {
      onSuccess: () => { invalidate(); setDeleteId(null); toast({ title: "Business removed" }); },
      onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--app-font-serif)" }}>Business List</h1>
          <p className="text-muted-foreground text-sm mt-0.5">SA businesses queued for content generation</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-add-business"><Plus className="w-4 h-4" /> Add Business</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add South African Business</DialogTitle></DialogHeader>
            <BusinessForm onSubmit={handleCreate} isLoading={createBusiness.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-5 space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : !businesses?.length ? (
            <div className="py-16 text-center">
              <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No businesses yet. Add one to get started.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {businesses.map((biz) => (
                <li key={biz.id} className="px-5 py-4 flex items-start gap-4 hover:bg-muted/30 transition-colors" data-testid={`row-business-${biz.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">{biz.name}</span>
                      <Badge variant="outline" className={`text-xs ${STATUS_COLORS[biz.status] ?? ""}`}>{biz.status}</Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 flex-wrap">
                      {biz.province && <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="w-3 h-3" />{biz.province}</span>}
                      {biz.industry && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Tag className="w-3 h-3" />{biz.industry}</span>}
                      {biz.website && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Globe className="w-3 h-3" />{biz.website}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditBusiness(biz)} data-testid={`button-edit-${biz.id}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(biz.id)} data-testid={`button-delete-${biz.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editBusiness} onOpenChange={(o) => !o && setEditBusiness(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Business</DialogTitle></DialogHeader>
          {editBusiness && (
            <BusinessForm
              defaultValues={{ name: editBusiness.name, website: editBusiness.website ?? "", province: editBusiness.province ?? "", industry: editBusiness.industry ?? "", notes: editBusiness.notes ?? "" }}
              onSubmit={handleUpdate}
              isLoading={updateBusiness.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove business?</AlertDialogTitle>
            <AlertDialogDescription>This will remove it from the seed list. Any generated content will remain.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
