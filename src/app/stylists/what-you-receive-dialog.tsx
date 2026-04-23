"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronRightIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const receiveFeatures = [
  { title: "Personalized Mood Board", image: "/img/hiw-moodboard.png" },
  { title: "Shoppable Outfit Boards", image: "/img/hiw-styleboards.png" },
  { title: "Direct Stylist Chat", image: "/img/hiw-chat.png" },
  { title: "Purchase Links", image: "/img/hiw-purchaselinks.png" },
  { title: "Wardrobe Guidance", image: "/img/hiw-wardrobe.png" },
  { title: "A Call with the Lux Package", image: "/img/hiw-lux.png" },
] as const;

export function WhatYouReceiveDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 font-display text-sm tracking-wide text-foreground hover:text-foreground/80 transition-colors"
      >
        <span>{"✦"}</span>
        See what&apos;s included in a styling session
        <ChevronRightIcon className="h-4 w-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-center font-normal">
              What You Receive
            </DialogTitle>
            <p className="text-sm text-muted-foreground text-center mt-1">
              Everything you need for a complete style transformation.
            </p>
          </DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            {receiveFeatures.map((f) => (
              <div key={f.title} className="text-center">
                <div className="relative aspect-square overflow-hidden rounded-xl bg-muted mb-3 ring-1 ring-border/50">
                  <Image
                    src={f.image}
                    alt={f.title}
                    fill
                    sizes="(min-width: 768px) 33vw, 50vw"
                    className="object-cover"
                  />
                </div>
                <p className="font-display text-sm">{f.title}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
