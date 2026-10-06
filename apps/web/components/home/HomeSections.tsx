"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, ChevronDown, MoveHorizontal } from "lucide-react";
import clsx from "clsx";
import { footerIcon as FooterIcon, iconToneClass } from "../../lib/home-content";
import type { HomeCopy, Locale } from "../../lib/home-content";

export function SectionIntro({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="max-w-[760px]">
      <p className="text-[0.76rem] font-extrabold uppercase tracking-[0.08em] text-[#0969FF]">{eyebrow}</p>
      <h2 className="mt-3 text-[clamp(1.8rem,2.7vw,2.5rem)] font-extrabold leading-[1.12] tracking-[-0.025em] text-[#071A3D]">{title}</h2>
      <p className="mt-4 max-w-[680px] text-[1rem] font-medium leading-[1.65] text-[#41506B] max-md:text-[0.94rem]">{body}</p>
    </div>
  );
}

export function PendingInsightSection({ copy: t }: { copy: HomeCopy }) {
  return (
    <section id="what-you-get" className="relative z-10 mx-auto mt-14 w-full max-w-[1240px] scroll-mt-28 px-5 xl:px-0 2xl:max-w-[1320px]">
      <SectionIntro {...t.sections.insights} />

      <div className="mt-8 hidden grid-cols-2 gap-6 lg:grid xl:grid-cols-4 xl:gap-9">
        {t.insights.map((insight, index) => (
          <PendingInsightCard key={insight.title} insight={insight} index={index} />
        ))}
      </div>

      <div className="-mx-5 mt-7 lg:hidden">
        <p id="insight-swipe-hint" className="mb-3 flex items-center gap-2 px-5 text-[0.8rem] font-bold text-[#50627F]">
          <MoveHorizontal className="h-4 w-4 text-[#0969FF]" aria-hidden="true" />
          {t.sections.insights.swipeHint}
        </p>
        <div
          className="flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-4 outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0969FF] [&::-webkit-scrollbar]:hidden"
          role="region"
          aria-label={t.nav.whatYouGet}
          aria-describedby="insight-swipe-hint"
          tabIndex={0}
        >
          {t.insights.map((insight, index) => (
            <div key={insight.title} className="w-[86vw] max-w-[360px] flex-none snap-start">
              <PendingInsightCard insight={insight} index={index} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PendingInsightCard({
  insight,
  index,
}: {
  insight: HomeCopy["insights"][number];
  index: number;
}) {
  const Icon = insight.icon;

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: 0.05 * index }}
      className="min-h-[232px] rounded-[18px] border border-[#DDE7F5] bg-white/72 p-7 shadow-[0_14px_38px_rgba(15,23,42,0.06)] backdrop-blur-xl max-md:min-h-[224px]"
    >
      <div className={clsx("flex h-12 w-12 items-center justify-center rounded-[14px]", iconToneClass[insight.tone])}>
        <Icon className="h-7 w-7" strokeWidth={2.15} aria-hidden="true" />
      </div>
      <h2 className="mt-6 text-[1.08rem] font-extrabold leading-tight text-[#0B1F3A]">{insight.title}</h2>
      <p className="mt-3 min-h-[52px] text-[0.91rem] font-medium leading-[1.55] text-[#41506B]">{insight.body}</p>
      <p className="mt-5 inline-flex items-center gap-2 text-[0.84rem] font-semibold text-[#36506F]">
        <CheckCircle2 className="h-5 w-5 flex-none text-[#0969FF]" strokeWidth={2.1} aria-hidden="true" />
        {insight.detail}
      </p>
    </motion.article>
  );
}

export function ProcessSection({ copy: t }: { copy: HomeCopy }) {
  return (
    <section id="how-it-works" className="relative z-10 mx-auto mt-16 w-full max-w-[1240px] scroll-mt-28 px-5 xl:px-0 2xl:max-w-[1320px]">
      <SectionIntro {...t.sections.process} />

      <div className="mt-8 grid grid-cols-1 items-center gap-4 xl:grid-cols-[1fr_auto_1fr_auto_1fr] xl:gap-5">
        {t.process.map((step, index) => (
          <ProcessFragment key={step.label} step={step} index={index} />
        ))}
      </div>
    </section>
  );
}

export function ProcessFragment({ step, index }: { step: HomeCopy["process"][number]; index: number }) {
  const Icon = step.icon;

  return (
    <>
      {index > 0 ? (
        <div className="hidden items-center justify-center xl:flex" aria-hidden="true">
          <ChevronDown className="-rotate-90 text-[#0969FF]" />
        </div>
      ) : null}
      <article className="min-h-[178px] rounded-[18px] border border-[#DDE7F5] bg-white/72 px-7 py-6 shadow-[0_12px_34px_rgba(15,23,42,0.05)] backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-[#0969FF] bg-white text-[1rem] font-extrabold text-[#0969FF]">
            {index + 1}
          </span>
          <h2 className="text-[1.02rem] font-extrabold text-[#0B1F3A]">{step.label}</h2>
        </div>
        <div className="mt-6 flex items-start gap-4">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] bg-[#EDF5FF] text-[#0969FF]">
            <Icon className="h-6 w-6" strokeWidth={2.1} aria-hidden="true" />
          </span>
          <p className="text-[0.9rem] font-medium leading-[1.58] text-[#41506B]">{step.body}</p>
        </div>
      </article>
    </>
  );
}

export function ReleaseContextSection({ copy: t, locale }: { copy: HomeCopy; locale: Locale }) {
  return (
    <section className="relative z-10 mx-auto mt-16 w-full max-w-[1240px] px-5 xl:px-0 2xl:max-w-[1320px]">
      <div className="relative overflow-hidden rounded-[28px] border border-[#CFE1F7] bg-[radial-gradient(circle_at_9%_5%,rgba(34,211,238,0.13),transparent_34%),radial-gradient(circle_at_90%_95%,rgba(124,58,237,0.11),transparent_36%),linear-gradient(132deg,rgba(255,255,255,0.94),rgba(239,247,255,0.9))] px-10 py-12 shadow-[0_24px_70px_rgba(37,99,235,0.09)] max-md:px-6 max-md:py-9">
        <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px bg-[linear-gradient(180deg,transparent,#C8DDF6,transparent)] lg:block" aria-hidden="true" />
        <div className="relative grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
          <p className="text-[0.76rem] font-extrabold uppercase text-[#0969FF]">{t.methodology.eyebrow}</p>
          <h2 className="mt-3 text-[1.7rem] font-extrabold leading-tight text-[#071A3D]">{t.methodology.title}</h2>
          <p className="mt-3 max-w-[580px] text-[0.96rem] font-medium leading-[1.65] text-[#41506B]">{t.methodology.body}</p>
          <ul className="mt-5 space-y-3">
            {t.methodology.points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-[0.9rem] font-semibold leading-[1.5] text-[#26385E]">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-[#0969FF]" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
          <Link href={`/${locale}/methodology`} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-[10px] text-[0.92rem] font-extrabold text-[#0969FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2563EB]">
            {t.methodology.link}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          </div>

          <div>
            <p className="text-[0.76rem] font-extrabold uppercase text-[#7C3AED]">{t.coverage.eyebrow}</p>
            <h2 className="mt-3 text-[1.7rem] font-extrabold leading-tight text-[#071A3D]">{t.coverage.title}</h2>
            <p className="mt-3 max-w-[580px] text-[0.96rem] font-medium leading-[1.65] text-[#41506B]">{t.coverage.body}</p>
            <ul className="mt-6 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {t.coverage.statuses.map((status, index) => (
                <li key={status} className="flex items-center gap-3 text-[0.86rem] font-bold text-[#26385E]">
                  <span className={clsx("h-2.5 w-2.5 flex-none rounded-full", index === 0 ? "bg-[#0969FF]" : index === 1 ? "bg-[#06B6D4]" : index === 2 ? "bg-[#7C3AED]" : "bg-[#8EA2BF]")} aria-hidden="true" />
                  {status}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FAQSection({ copy: t, openFaq, onToggle }: { copy: HomeCopy; openFaq: number | null; onToggle: (index: number) => void }) {
  return (
    <section id="faq" className="relative z-10 mx-auto mt-16 w-full max-w-[1240px] scroll-mt-28 px-5 xl:px-0 2xl:max-w-[1320px]">
      <SectionIntro {...t.sections.faq} />

      <div className="mt-8 overflow-hidden rounded-[18px] border border-[#D5E3F4] bg-white/78 shadow-[0_16px_48px_rgba(15,23,42,0.055)] backdrop-blur-xl">
        {t.faq.map((item, index) => {
          const open = openFaq === index;
          return (
            <div key={item.question} className={clsx(index > 0 && "border-t border-[#DDE7F5]")}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`faq-panel-${index}`}
                onClick={() => onToggle(index)}
                className="flex min-h-[42px] w-full items-center justify-between gap-4 px-8 py-3 text-left text-[0.96rem] font-extrabold text-[#071A3D] transition hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#2563EB] max-md:px-5"
              >
                {item.question}
                <ChevronDown className={clsx("h-5 w-5 flex-none transition", open && "rotate-180")} aria-hidden="true" />
              </button>
              {open ? (
                <div id={`faq-panel-${index}`} className="px-8 pb-5 text-[0.94rem] font-medium leading-[1.65] text-[#41506B] max-md:px-5">
                  {item.answer}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function FinalCTA({ copy: t, locale }: { copy: HomeCopy; locale: Locale }) {
  return (
    <section id="contact" className="relative z-10 mx-auto mt-12 w-full max-w-[1240px] px-5 pb-4 xl:px-0 2xl:max-w-[1320px]">
      <div className="flex items-center gap-7 rounded-[16px] border border-[#DDE7F5] bg-white/72 px-8 py-6 shadow-[0_16px_42px_rgba(15,23,42,0.055)] backdrop-blur-xl max-lg:flex-col max-lg:items-start max-md:px-5">
        <div className="flex h-[86px] w-[86px] flex-none items-center justify-center rounded-full bg-[radial-gradient(circle,#FFFFFF_0%,#EBF5FF_56%,#DDEBFF_100%)] shadow-[inset_0_0_0_1px_rgba(37,99,235,0.22),0_8px_28px_rgba(37,99,235,0.14)]">
          <FooterIcon className="h-11 w-11 text-[#0969FF]" strokeWidth={1.9} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[1.55rem] font-extrabold leading-tight text-[#071A3D] max-md:text-[1.35rem]">{t.finalCta.title}</h2>
          <p className="mt-2 text-[0.98rem] font-medium leading-[1.6] text-[#41506B]">{t.finalCta.body}</p>
          <p className="mt-3 inline-flex items-start gap-2 text-[0.82rem] font-medium leading-[1.45] text-[#41506B]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-[#0969FF]" aria-hidden="true" />
            {t.finalCta.note}
          </p>
        </div>
        <div className="flex flex-none flex-wrap items-center justify-end gap-3 max-lg:w-full max-lg:items-stretch max-lg:justify-start">
          <Link
            href={`/${locale}/address-check`}
            className="inline-flex h-[56px] min-w-[210px] items-center justify-center rounded-[12px] border border-[#A9C5EA] bg-white/80 px-5 text-[0.9rem] font-bold text-[#0758D2] transition hover:-translate-y-0.5 hover:border-[#7EACE8] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563EB] max-lg:min-w-0"
          >
            {t.finalCta.secondary}
          </Link>
          <Link
            href={`/${locale}/check`}
            className="inline-flex h-[56px] min-w-[250px] items-center justify-center gap-3 rounded-[12px] bg-[linear-gradient(92deg,#0969FF_0%,#2563EB_45%,#7C3AED_100%)] px-6 text-[0.94rem] font-bold text-white shadow-[0_14px_30px_rgba(37,99,235,0.24)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563EB] max-lg:min-w-0"
          >
            {t.finalCta.primary}
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
