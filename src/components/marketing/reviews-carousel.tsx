"use client";

import { useEffect, useState } from "react";
import { StarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/primitives/reveal";

/**
 * Verbatim port of smart-spark-craft ReviewsCarousel.tsx — auto-rotates every
 * 4s, shows 3 cards on desktop / 1 on mobile, dots beneath. Used on /pricing.
 */
const reviews = [
  {
    id: 1,
    name: "Sarah M.",
    rating: 5,
    text: "My stylist completely transformed my wardrobe. I finally feel confident getting dressed every morning!",
    plan: "Wishi Major",
  },
  {
    id: 2,
    name: "Jessica L.",
    rating: 5,
    text: "Worth every penny. The personalized boards were so on-point — my stylist really understood my lifestyle.",
    plan: "Wishi Lux",
  },
  {
    id: 3,
    name: "Amanda K.",
    rating: 5,
    text: "I was skeptical about online styling but my Wishi stylist blew me away. I've already rebooked!",
    plan: "Wishi Mini",
  },
  {
    id: 4,
    name: "Rachel T.",
    rating: 5,
    text: "The closet styling feature alone is a game-changer. I'm shopping my own wardrobe in new ways.",
    plan: "Wishi Major",
  },
  {
    id: 5,
    name: "Monica P.",
    rating: 5,
    text: "My stylist found brands I never would have discovered on my own. Obsessed with every piece.",
    plan: "Wishi Lux",
  },
  {
    id: 6,
    name: "Lauren H.",
    rating: 5,
    text: "The intro call made all the difference — my stylist nailed my aesthetic from the very first board.",
    plan: "Wishi Lux",
  },
] as const;

export function ReviewsCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % reviews.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const visibleDesktop = Array.from({ length: 3 }, (_, i) =>
    reviews[(currentIndex + i) % reviews.length],
  );

  return (
    <section className="bg-foreground text-background">
      <div className="container max-w-5xl py-14 md:py-20">
        <Reveal>
          <h2 className="font-display text-3xl md:text-4xl text-center mb-12">
            What Our Clients Say
          </h2>
        </Reveal>

        {/* Desktop: 3 cards */}
        <div className="hidden md:grid grid-cols-3 gap-6">
          {visibleDesktop.map((review) => (
            <div
              key={review.id}
              className="rounded-xl bg-background/10 backdrop-blur p-8 flex flex-col"
            >
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: review.rating }).map((_, i) => (
                  <StarIcon
                    key={i}
                    className="h-4 w-4 fill-background text-background"
                  />
                ))}
              </div>
              <p className="font-body text-sm leading-relaxed flex-1 mb-6 text-background/90">
                &ldquo;{review.text}&rdquo;
              </p>
              <div>
                <p className="font-display text-base">{review.name}</p>
                <p className="font-body text-xs text-background/50">
                  {review.plan}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Mobile: 1 card */}
        <div className="md:hidden">
          <div
            key={reviews[currentIndex].id}
            className="rounded-xl bg-background/10 backdrop-blur p-8"
          >
            <div className="flex gap-0.5 mb-4">
              {Array.from({ length: reviews[currentIndex].rating }).map((_, i) => (
                <StarIcon
                  key={i}
                  className="h-4 w-4 fill-background text-background"
                />
              ))}
            </div>
            <p className="font-body text-sm leading-relaxed mb-6 text-background/90">
              &ldquo;{reviews[currentIndex].text}&rdquo;
            </p>
            <div>
              <p className="font-display text-base">
                {reviews[currentIndex].name}
              </p>
              <p className="font-body text-xs text-background/50">
                {reviews[currentIndex].plan}
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-2 mt-8">
          {reviews.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Show review ${i + 1}`}
              onClick={() => setCurrentIndex(i)}
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                i === currentIndex ? "bg-background" : "bg-background/30",
              )}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
