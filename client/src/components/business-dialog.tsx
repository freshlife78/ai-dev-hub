import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAppState } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const COLORS = [
  "#58a6ff", "#3fb950", "#d29922", "#f85149",
  "#bc8cff", "#f778ba", "#79c0ff", "#7ee787",
];

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string(),
  color: z.string(),
});

interface BusinessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BusinessDialog({ open, onOpenChange }: BusinessDialogProps) {
  const { toast } = useToast();
  const { setSelectedBusinessId, setCurrentView } = useAppState();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      color: COLORS[0],
    },
  });

  const prevOpen = useRef(false);
  useEffect(() => {
    if (open && !prevOpen.current) {
      form.reset({
        name: "",
        description: "",
        color: COLORS[0],
      });
    }
    prevOpen.current = open;
  }, [open]);

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const res = await apiRequest("POST", "/api/businesses", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses"] });
      setSelectedBusinessId(data.id);
      setCurrentView("all-tasks");
      toast({ title: "Business created" });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Business</DialogTitle>
          <DialogDescription>
            Create a new business to manage projects, repositories, tasks, and code reviews.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Business Name</FormLabel>
                  <FormControl>
                    <Input placeholder="My Business" {...field} data-testid="input-biz-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What is this business about?"
                      className="resize-none"
                      {...field}
                      data-testid="input-biz-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <FormControl>
                    <div className="flex gap-2 flex-wrap">
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`w-7 h-7 rounded-md transition-all ${
                            field.value === c
                              ? "ring-2 ring-offset-2 ring-offset-background ring-primary scale-110"
                              : "opacity-70"
                          }`}
                          style={{ backgroundColor: c }}
                          onClick={() => field.onChange(c)}
                          data-testid={`color-${c}`}
                        />
                      ))}
                    </div>
                  </FormControl>
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-biz"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-create-biz">
                {mutation.isPending ? "Creating..." : "Create Business"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
