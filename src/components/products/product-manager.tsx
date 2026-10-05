"use client";

import { Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteProduct, setProductActive, updateProduct } from "@/app/dashboard/[bizId]/product-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { WhatsAppIcon } from "@/components/ui/share-actions";
import { ActionSwitch } from "@/components/ui/switch";
import { formatMoney } from "@/lib/format";
import type { BusinessProduct } from "@/lib/types";
import { shareText, shareToStatus } from "./media";
import { chosenCategory, useCategoryOptions, type CategoryOptions } from "./category-picker";
import { ProductFields, type ProductFieldValues } from "./product-fields";

/** Share, edit, hide or delete one product. */
export function ProductManager({ bizId, product, businessName, joinUrl, categories }: { bizId: string; product: BusinessProduct; businessName: string; joinUrl: string; categories: CategoryOptions }) {
  const cats = useCategoryOptions(categories);
  const router = useRouter();
  const [values, setValues] = useState<ProductFieldValues>({
    kind: product.kind,
    title: product.title,
    description: product.description ?? "",
    price: product.price === null ? "" : String(Math.round(product.price)),
    category: product.category ?? null,
  });
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [pending, startTransition] = useTransition();

  const share = async () => {
    setSharing(true);
    const price = product.price !== null ? formatMoney(product.price, product.currency) : null;
    const how = await shareToStatus({ mediaUrl: product.media_url, text: shareText(product.title, price, businessName, joinUrl) });
    setSharing(false);
    if (how === "whatsapp") setMessage({ tone: "success", text: "WhatsApp opened with the words and your link. Add the photo or video from your gallery to post it on your status." });
  };

  return (
    <div className="flex flex-col gap-5">
      <Button size="lg" block loading={sharing} onClick={() => void share()} className="bg-[#107A42] hover:bg-[#0c6536]">
        {!sharing && <WhatsAppIcon className="size-5" />} Share to WhatsApp status
      </Button>

      <Card className="flex items-center justify-between gap-4 p-4">
        <div>
          <p className="font-semibold">Showing to customers</p>
          <p className="text-sm text-muted">Switch off to hide it without deleting it.</p>
        </div>
        <ActionSwitch initial={product.is_active} label="Showing to customers" action={(on) => setProductActive(bizId, product.id, on)} />
      </Card>

      <Card className="p-5">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            setMessage(null);
            startTransition(async () => {
              const r = await updateProduct(bizId, product.id, { ...values, category: chosenCategory(values.category, values, cats.options) });
              setMessage(r.ok ? { tone: "success", text: "Saved." } : { tone: "error", text: r.error });
            });
          }}
        >
          <ProductFields values={values} onChange={setValues} categories={cats} />
          <Button type="submit" loading={pending}>
            Save changes
          </Button>
        </form>
      </Card>
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}

      <Button variant="ghost" className="w-fit text-red-700" onClick={() => setConfirmDelete(true)}>
        <Trash className="size-4" aria-hidden /> Delete
      </Button>
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this?" description="It disappears for your customers, and its views and saves are deleted too.">
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await deleteProduct(bizId, product.id);
                if (r.ok) router.replace(`/dashboard/${bizId}`);
                else setMessage({ tone: "error", text: r.error });
              })
            }
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
