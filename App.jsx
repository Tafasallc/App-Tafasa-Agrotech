import React, { useState, useMemo, useEffect } from "react";
import { supabase } from "./supabaseClient.js";
import {
  Home, Store, PlusCircle, Handshake, User, MapPin, TrendingUp,
  TrendingDown, Phone, ChevronLeft, Search, Wheat, Sprout, Droplets,
  Tractor, Check, X, Clock, ShieldCheck, ArrowUpRight, Sprout as SproutIcon,
  ShoppingBag, MessageSquare, LogOut
} from "lucide-react";

const MARKET_NAMES = { AUY: "Auyo", KAZ: "Kazaure", HAD: "Hadejia" };
const MARKET_CODES = { Auyo: "AUY", Kazaure: "KAZ", Hadejia: "HAD" };
const CROP_ICON = { MAI: "🌽", SOR: "🌾", MIL: "🌾", RIC: "🍚", GNT: "🥜", COW: "🫘" };

async function fetchPriceData() {
  const { data, error } = await supabase.from("price_aggregates").select("*");
  if (error) { console.error(error); return []; }
  return data.map((r) => ({
    crop: r.crop_code, market: MARKET_NAMES[r.market_code] || r.market_code,
    min: r.min_price, avg: r.avg_price, max: r.max_price, unit: "bag",
    trend: r.trend_pct, reports: r.report_count, updated: "Today",
  }));
}

async function fetchListings() {
  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) { console.error(error); return []; }
  return data.map((r) => ({
    id: r.id, crop: r.crop_code, farmer: r.farmer_name,
    market: MARKET_NAMES[r.market_code] || r.market_code,
    qty: r.quantity, unit: r.unit, price: r.price, grade: r.grade,
    date: "Available now", photo: CROP_ICON[r.crop_code] || "🌾",
  }));
}

async function createListing({ cropCode, marketName, qty, price, grade, farmerName, farmerPhone }) {
  const { error } = await supabase.from("listings").insert({
    farmer_name: farmerName || "Demo Farmer",
    farmer_phone: farmerPhone || "0000000000",
    crop_code: cropCode,
    market_code: MARKET_CODES[marketName] || marketName,
    quantity: qty,
    unit: "bag",
    price,
    grade,
  });
  if (error) console.error("Failed to create listing:", error);
  return !error;
}

// ---------- Phone auth (Supabase Phone OTP) ----------

// Normalizes Nigerian local numbers (0801 234 5678) to E.164 (+2348012345678).
// Supabase Phone Auth requires E.164. Leaves already-international numbers alone.
function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) return "+" + digits;
  if (digits.startsWith("234")) return "+" + digits;
  if (digits.startsWith("0")) return "+234" + digits.slice(1);
  return "+234" + digits;
}

async function sendOtp(rawPhone) {
  const phone = normalizePhone(rawPhone);
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) console.error("Failed to send OTP:", error);
  return { ok: !error, phone, message: error?.message };
}

async function verifyOtpCode(phone, token) {
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (error) {
    console.error("OTP verification failed:", error);
    return { ok: false, message: error.message };
  }
  return { ok: true, session: data.session };
}

// Creates the user's profile row (their real account) and a matching entry
// in the admin verification queue, linked together via profile_id.
async function completeRegistration({ userId, phone, name, role, market, lang }) {
  const marketCode = MARKET_CODES[market] || market;

  const { error: profileError } = await supabase.from("profiles").insert({
    id: userId, phone, name, role, market_code: marketCode, lang,
  });
  if (profileError) {
    console.error("Failed to create profile:", profileError);
    return false;
  }

  const { error: queueError } = await supabase.from("user_verifications").insert({
    name, phone, role, market_code: marketCode,
    channel: "App signup (phone-verified)", profile_id: userId,
  });
  if (queueError) console.error("Failed to queue verification:", queueError);

  return true;
}

async function fetchExistingProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) { console.error(error); return null; }
  if (!data) return null;
  return {
    role: data.role, name: data.name, phone: data.phone,
    market: Object.keys(MARKET_CODES).find((k) => MARKET_CODES[k] === data.market_code) || data.market_code,
    lang: data.lang, verified: data.verified,
  };
}

// ---------- Design tokens ----------
// Indigo (adire dye)   #23305A
// Millet gold          #D9A62E
// Sorghum red-brown    #B4482A
// Baobab green         #4C7A52
// Warm husk background #F1EAD6

const CROPS = {
  MAI: { name: "Maize", local: "Masara", icon: "🌽" },
  SOR: { name: "Sorghum", local: "Dawa", icon: "🌾" },
  MIL: { name: "Millet", local: "Gero", icon: "🌾" },
  RIC: { name: "Rice", local: "Shinkafa", icon: "🍚" },
  GNT: { name: "Groundnut", local: "Gyada", icon: "🥜" },
  COW: { name: "Cowpea", local: "Wake", icon: "🫘" },
};

const SERVICES = [
  { icon: Tractor, name: "Tractor & ploughing", provider: "Auyo Machinery Co-op", area: "Auyo & environs" },
  { icon: Droplets, name: "Spraying service", provider: "Garba Agro Services", area: "Auyo, Kazaure" },
  { icon: Sprout, name: "Soil testing", provider: "Jigawa Extension Unit", area: "Local govt-wide" },
];

function naira(n) {
  return "₦" + n.toLocaleString("en-NG");
}

// ---------- Signature component: woven price-range bar ----------
function PriceRangeBar({ min, avg, max, compact }) {
  const pct = ((avg - min) / (max - min)) * 100;
  return (
    <div className={compact ? "w-full" : "w-full mt-2"}>
      <div className="relative h-2.5 rounded-full overflow-hidden bg-[#E4D8B8]">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: "100%",
            background: "repeating-linear-gradient(115deg, #D9A62E 0 6px, #C68F1F 6px 12px)",
          }}
        />
      </div>
      <div
        className="relative -mt-[10px] ml-0"
        style={{ marginLeft: `calc(${pct}% - 5px)` }}
      >
        <div className="w-2.5 h-2.5 rounded-full bg-[#23305A] ring-2 ring-[#F1EAD6]" />
      </div>
      {!compact && (
        <div className="flex justify-between mt-1 font-mono text-[11px] text-[#6B6248]">
          <span>{naira(min)}</span>
          <span className="font-semibold text-[#23305A]">{naira(avg)}</span>
          <span>{naira(max)}</span>
        </div>
      )}
    </div>
  );
}

function TrendBadge({ trend }) {
  const up = trend >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded-full ${
        up ? "bg-[#E4EEE3] text-[#4C7A52]" : "bg-[#F3E1DA] text-[#B4482A]"
      }`}
    >
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {Math.abs(trend)}%
    </span>
  );
}

// ---------- Screens ----------

function HomeScreen({ prices }) {
  return (
    <div className="px-4 pt-5 pb-24">
      <div className="flex items-center justify-between mb-1">
        <div>
          <p className="text-[13px] text-[#8A8064] font-medium">Sannu, Ibrahim</p>
          <h1 className="font-display text-[22px] text-[#23305A] leading-tight">
            Auyo market today
          </h1>
        </div>
        <div className="w-10 h-10 rounded-full bg-[#23305A] flex items-center justify-center text-[#F1EAD6] font-display text-sm">
          IS
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[12px] text-[#8A8064] mb-5">
        <MapPin size={13} />
        Auyo LGA, Jigawa State
        <span className="mx-1">·</span>
        <Clock size={13} />
        Market day: Wednesday
      </div>

      <h2 className="font-display text-[15px] text-[#23305A] mb-2.5">
        Reference prices
      </h2>
      <div className="space-y-2.5 mb-6">
        {prices.map((p, i) => {
          const c = CROPS[p.crop];
          return (
            <div
              key={i}
              className="bg-white rounded-2xl px-4 py-3.5 border border-[#E9DFC2] shadow-[0_1px_0_#E9DFC2]"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg leading-none">{c.icon}</span>
                  <div>
                    <p className="text-[14px] font-semibold text-[#23305A]">{c.name}</p>
                    <p className="text-[11px] text-[#8A8064]">{c.market} · per {p.unit}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[14px] font-semibold text-[#23305A]">
                    {naira(p.avg)}
                  </p>
                  <TrendBadge trend={p.trend} />
                </div>
              </div>
              <PriceRangeBar min={p.min} avg={p.avg} max={p.max} compact />
              <div className="flex items-center justify-between mt-1.5 text-[10.5px] text-[#8A8064]">
                <span>{p.reports} reports · {p.updated}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-[#23305A] rounded-2xl p-4 flex items-start gap-3">
        <ShieldCheck size={20} className="text-[#D9A62E] mt-0.5 shrink-0" />
        <div>
          <p className="text-[13px] font-semibold text-white">Report a price</p>
          <p className="text-[11.5px] text-[#C7CCDC] mt-0.5 leading-snug">
            Text your market price to 32665, or dial *789# — help keep Auyo's
            prices accurate.
          </p>
        </div>
      </div>
    </div>
  );
}

function MarketplaceScreen({ onOpenListing, listings, prices }) {
  const [filter, setFilter] = useState("ALL");
  const filtered = useMemo(
    () => (filter === "ALL" ? listings : listings.filter((l) => l.crop === filter)),
    [filter, listings]
  );

  return (
    <div className="px-4 pt-5 pb-24">
      <h1 className="font-display text-[22px] text-[#23305A] mb-3">Marketplace</h1>

      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8064]" />
        <input
          placeholder="Search crop, market, farmer..."
          className="w-full bg-white border border-[#E9DFC2] rounded-xl py-2.5 pl-9 pr-3 text-[13px] text-[#23305A] placeholder:text-[#B0A883] outline-none focus:ring-2 focus:ring-[#D9A62E]"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto mb-4 pb-1 -mx-4 px-4 no-scrollbar">
        {["ALL", ...Object.keys(CROPS)].map((code) => (
          <button
            key={code}
            onClick={() => setFilter(code)}
            className={`shrink-0 text-[12px] font-medium px-3 py-1.5 rounded-full border transition-colors ${
              filter === code
                ? "bg-[#23305A] border-[#23305A] text-white"
                : "bg-white border-[#E9DFC2] text-[#5C5540]"
            }`}
          >
            {code === "ALL" ? "All crops" : CROPS[code].name}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((l) => {
          const c = CROPS[l.crop];
          const ref = prices.find((p) => p.crop === l.crop);
          const diff = ref ? Math.round(((l.price - ref.avg) / ref.avg) * 100) : 0;
          return (
            <button
              key={l.id}
              onClick={() => onOpenListing(l)}
              className="w-full text-left bg-white rounded-2xl p-3.5 border border-[#E9DFC2] flex gap-3 active:bg-[#FAF5E8]"
            >
              <div className="w-14 h-14 rounded-xl bg-[#F1EAD6] flex items-center justify-center text-2xl shrink-0">
                {l.photo}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[14px] font-semibold text-[#23305A]">
                      {c.name} · {l.qty} {l.unit}s
                    </p>
                    <p className="text-[11px] text-[#8A8064]">{l.farmer} · {l.market}</p>
                  </div>
                  <p className="font-mono text-[13.5px] font-semibold text-[#23305A] whitespace-nowrap">
                    {naira(l.price)}
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10.5px] px-1.5 py-0.5 rounded-full bg-[#F1EAD6] text-[#5C5540]">
                    {l.grade}
                  </span>
                  {ref && (
                    <span
                      className={`text-[10.5px] font-mono ${
                        diff <= 0 ? "text-[#4C7A52]" : "text-[#B4482A]"
                      }`}
                    >
                      {diff <= 0 ? "" : "+"}
                      {diff}% vs benchmark
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ListingDetail({ listing, onBack, onContact, prices }) {
  const c = CROPS[listing.crop];
  const ref = prices.find((p) => p.crop === listing.crop);
  const [offerSent, setOfferSent] = useState(false);

  return (
    <div className="pb-24">
      <div className="px-4 pt-5 pb-3 flex items-center gap-3">
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-white border border-[#E9DFC2] flex items-center justify-center">
          <ChevronLeft size={16} className="text-[#23305A]" />
        </button>
        <h1 className="font-display text-[18px] text-[#23305A]">Listing details</h1>
      </div>

      <div className="px-4">
        <div className="bg-white rounded-2xl border border-[#E9DFC2] p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-16 h-16 rounded-xl bg-[#F1EAD6] flex items-center justify-center text-3xl">
              {listing.photo}
            </div>
            <div>
              <p className="font-display text-[17px] text-[#23305A]">
                {c.name} <span className="text-[13px] text-[#8A8064] font-sans">({c.local})</span>
              </p>
              <p className="text-[12px] text-[#8A8064]">{listing.qty} {listing.unit}s · {listing.grade}</p>
            </div>
          </div>

          <div className="flex items-center justify-between py-3 border-y border-[#EFE7CE]">
            <div>
              <p className="text-[11px] text-[#8A8064]">Asking price</p>
              <p className="font-mono text-[20px] font-semibold text-[#23305A]">
                {naira(listing.price)}
                <span className="text-[12px] text-[#8A8064] font-sans"> /{listing.unit}</span>
              </p>
            </div>
            {ref && (
              <div className="text-right">
                <p className="text-[11px] text-[#8A8064]">Market benchmark</p>
                <p className="font-mono text-[13px] text-[#5C5540]">{naira(ref.avg)}</p>
              </div>
            )}
          </div>

          {ref && (
            <div className="pt-3">
              <p className="text-[11px] text-[#8A8064] mb-1">This week's range at {listing.market}</p>
              <PriceRangeBar min={ref.min} avg={ref.avg} max={ref.max} />
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-[#E9DFC2] p-4 mt-3">
          <p className="text-[11px] text-[#8A8064] mb-2">Farmer</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-[#23305A] flex items-center justify-center text-white text-[12px] font-display">
                {listing.farmer.split(" ").map((n) => n[0]).join("")}
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[#23305A]">{listing.farmer}</p>
                <p className="text-[10.5px] text-[#8A8064] flex items-center gap-1">
                  <MapPin size={10} /> {listing.market} market · {listing.date}
                </p>
              </div>
            </div>
            <span className="text-[10px] bg-[#E4EEE3] text-[#4C7A52] px-2 py-1 rounded-full font-medium flex items-center gap-1">
              <ShieldCheck size={11} /> Verified
            </span>
          </div>
        </div>

        {!offerSent ? (
          <div className="mt-4 flex gap-2.5">
            <button
              onClick={() => setOfferSent(true)}
              className="flex-1 bg-[#D9A62E] text-[#23305A] font-semibold text-[13.5px] rounded-xl py-3 active:opacity-80"
            >
              Send offer at asking price
            </button>
            <button
              onClick={onContact}
              className="w-12 h-12 rounded-xl bg-[#23305A] flex items-center justify-center shrink-0"
            >
              <Phone size={17} className="text-white" />
            </button>
          </div>
        ) : (
          <div className="mt-4 bg-[#E4EEE3] rounded-xl p-3.5 flex items-center gap-2.5">
            <Check size={18} className="text-[#4C7A52] shrink-0" />
            <p className="text-[12.5px] text-[#3C5D40]">
              Offer sent to {listing.farmer.split(" ")[0]}. You'll be notified by
              SMS when they respond.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ContactModal({ listing, onClose }) {
  if (!listing) return null;
  return (
    <div className="absolute inset-0 bg-black/40 flex items-end z-20" onClick={onClose}>
      <div
        className="w-full bg-white rounded-t-3xl p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-[#E9DFC2] rounded-full mx-auto mb-4" />
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck size={18} className="text-[#D9A62E]" />
          <p className="font-display text-[16px] text-[#23305A]">Private contact number</p>
        </div>
        <p className="text-[12.5px] text-[#8A8064] leading-snug mb-4">
          Call this number to reach {listing.farmer.split(" ")[0]} directly. It
          connects you without sharing either phone number, and expires in 48
          hours.
        </p>
        <div className="bg-[#F1EAD6] rounded-xl py-4 text-center mb-4">
          <p className="font-mono text-[22px] font-semibold text-[#23305A] tracking-wide">
            0700 231 4459
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-full bg-[#23305A] text-white font-semibold text-[13.5px] rounded-xl py-3"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function SellScreen({ prices, user, onListingPosted }) {
  const [crop, setCrop] = useState("MAI");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [grade, setGrade] = useState("Dry, clean");
  const [market, setMarket] = useState(user?.market || "Auyo");
  const [posted, setPosted] = useState(false);
  const [saving, setSaving] = useState(false);

  const canPost = qty && price && +qty > 0 && +price > 0;

  const submit = async () => {
    setSaving(true);
    const ok = await createListing({
      cropCode: crop,
      marketName: market,
      qty: +qty,
      price: +price,
      grade,
      farmerName: user?.name,
      farmerPhone: user?.phone,
    });
    setSaving(false);
    if (ok) {
      setPosted(true);
      setQty("");
      setPrice("");
      onListingPosted?.();
    }
  };

  return (
    <div className="px-4 pt-5 pb-24">
      <h1 className="font-display text-[22px] text-[#23305A] mb-1">List your produce</h1>
      <p className="text-[12.5px] text-[#8A8064] mb-5">Takes less than a minute.</p>

      {posted ? (
        <div className="bg-white rounded-2xl border border-[#E9DFC2] p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-[#E4EEE3] flex items-center justify-center mx-auto mb-3">
            <Check size={22} className="text-[#4C7A52]" />
          </div>
          <p className="font-display text-[16px] text-[#23305A] mb-1">Listing posted</p>
          <p className="text-[12.5px] text-[#8A8064] mb-4">
            Buyers near {market} can now see your {CROPS[crop].name.toLowerCase()}.
          </p>
          <button
            onClick={() => setPosted(false)}
            className="text-[12.5px] font-semibold text-[#23305A] underline underline-offset-2"
          >
            List another crop
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="text-[12px] font-medium text-[#5C5540] mb-1.5 block">Crop</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(CROPS).map(([code, c]) => (
                <button
                  key={code}
                  onClick={() => setCrop(code)}
                  className={`rounded-xl py-2.5 text-[12px] font-medium border flex flex-col items-center gap-1 ${
                    crop === code
                      ? "bg-[#23305A] border-[#23305A] text-white"
                      : "bg-white border-[#E9DFC2] text-[#5C5540]"
                  }`}
                >
                  <span className="text-lg leading-none">{c.icon}</span>
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-[#5C5540] mb-1.5 block">Quantity (bags)</label>
              <input
                type="number"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="e.g. 80"
                className="w-full bg-white border border-[#E9DFC2] rounded-xl py-2.5 px-3 text-[13.5px] outline-none focus:ring-2 focus:ring-[#D9A62E]"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-[#5C5540] mb-1.5 block">Price / bag (₦)</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g. 45000"
                className="w-full bg-white border border-[#E9DFC2] rounded-xl py-2.5 px-3 text-[13.5px] outline-none focus:ring-2 focus:ring-[#D9A62E]"
              />
            </div>
          </div>

          {(() => {
            const ref = prices.find((p) => p.crop === crop);
            return ref ? (
              <div className="bg-[#F1EAD6] rounded-xl px-3.5 py-3">
                <p className="text-[11px] text-[#5C5540] mb-1">
                  {market} benchmark for {CROPS[crop].name.toLowerCase()} this week
                </p>
                <PriceRangeBar min={ref.min} avg={ref.avg} max={ref.max} />
              </div>
            ) : null;
          })()}

          <div>
            <label className="text-[12px] font-medium text-[#5C5540] mb-1.5 block">Quality</label>
            <div className="flex gap-2">
              {["Dry, clean", "Sorted", "Mixed grade"].map((g) => (
                <button
                  key={g}
                  onClick={() => setGrade(g)}
                  className={`text-[11.5px] px-3 py-1.5 rounded-full border ${
                    grade === g
                      ? "bg-[#23305A] border-[#23305A] text-white"
                      : "bg-white border-[#E9DFC2] text-[#5C5540]"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium text-[#5C5540] mb-1.5 block">Pickup market</label>
            <select
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              className="w-full bg-white border border-[#E9DFC2] rounded-xl py-2.5 px-3 text-[13.5px] outline-none focus:ring-2 focus:ring-[#D9A62E]"
            >
              <option>Auyo</option>
              <option>Kazaure</option>
              <option>Hadejia</option>
            </select>
          </div>

          <button
            disabled={!canPost || saving}
            onClick={submit}
            className={`w-full font-semibold text-[13.5px] rounded-xl py-3.5 mt-2 ${
              canPost && !saving
                ? "bg-[#D9A62E] text-[#23305A] active:opacity-80"
                : "bg-[#E9DFC2] text-[#B0A883]"
            }`}
          >
            {saving ? "Posting…" : "Post listing"}
          </button>
        </div>
      )}
    </div>
  );
}

function DealsScreen() {
  const deals = [
    { crop: "MAI", counterparty: "Buyer · Kano Feed Mills", qty: "80 bags", status: "Awaiting your response", state: "pending" },
    { crop: "GNT", counterparty: "Zainab Auwal (farmer)", qty: "40 bags", status: "Pickup scheduled — Thu", state: "logistics" },
    { crop: "RIC", counterparty: "Buyer · Hadiza's Store", qty: "25 bags", status: "Completed", state: "done" },
  ];
  const styles = {
    pending: "bg-[#F3E9CE] text-[#8A6A1A]",
    logistics: "bg-[#DCE3F0] text-[#23305A]",
    done: "bg-[#E4EEE3] text-[#4C7A52]",
  };

  return (
    <div className="px-4 pt-5 pb-24">
      <h1 className="font-display text-[22px] text-[#23305A] mb-4">Your deals</h1>
      <div className="space-y-2.5">
        {deals.map((d, i) => (
          <div key={i} className="bg-white rounded-2xl border border-[#E9DFC2] p-3.5 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#F1EAD6] flex items-center justify-center text-xl shrink-0">
              {CROPS[d.crop].icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-semibold text-[#23305A]">
                {CROPS[d.crop].name} · {d.qty}
              </p>
              <p className="text-[11px] text-[#8A8064]">{d.counterparty}</p>
            </div>
            <span className={`text-[10px] font-medium px-2 py-1 rounded-full whitespace-nowrap ${styles[d.state]}`}>
              {d.status}
            </span>
          </div>
        ))}
      </div>

      <h2 className="font-display text-[15px] text-[#23305A] mt-6 mb-2.5">Farm services</h2>
      <div className="space-y-2.5">
        {SERVICES.map((s, i) => (
          <div key={i} className="bg-white rounded-2xl border border-[#E9DFC2] p-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#23305A] flex items-center justify-center shrink-0">
              <s.icon size={17} className="text-[#D9A62E]" />
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-[#23305A]">{s.name}</p>
              <p className="text-[11px] text-[#8A8064]">{s.provider} · {s.area}</p>
            </div>
            <ArrowUpRight size={15} className="text-[#8A8064]" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Onboarding / Registration ----------

function WelcomeScreen({ onStart }) {
  return (
    <div className="min-h-screen flex flex-col justify-between px-6 py-10">
      <div />
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#23305A] flex items-center justify-center mx-auto mb-5">
          <Wheat size={28} className="text-[#D9A62E]" />
        </div>
        <h1 className="font-display text-[28px] text-[#23305A] leading-tight">
          Tafasa <span className="text-[#B4482A]">Agrotech</span>
        </h1>
        <p className="text-[13.5px] text-[#8A8064] mt-2 leading-snug max-w-[260px] mx-auto">
          Fair prices, direct buyers, and trusted inputs — built for farmers
          in Auyo and beyond.
        </p>
      </div>
      <div className="space-y-3">
        <button
          onClick={onStart}
          className="w-full bg-[#D9A62E] text-[#23305A] font-semibold text-[14px] rounded-xl py-3.5 active:opacity-80"
        >
          Get started
        </button>
        <p className="text-center text-[11px] text-[#B0A883]">
          Works on any phone — app, SMS, or *789#
        </p>
      </div>
    </div>
  );
}

function RoleSelectScreen({ onSelect, onBack }) {
  const roles = [
    { id: "farmer", label: "I'm a farmer", desc: "Sell produce, check prices, order inputs", icon: SproutIcon },
    { id: "buyer", label: "I'm a buyer", desc: "Browse listings, order in bulk", icon: ShoppingBag },
  ];
  return (
    <div className="min-h-screen px-6 pt-10 pb-8 flex flex-col">
      <button onClick={onBack} className="w-8 h-8 rounded-full bg-white border border-[#E9DFC2] flex items-center justify-center mb-6">
        <ChevronLeft size={16} className="text-[#23305A]" />
      </button>
      <h1 className="font-display text-[22px] text-[#23305A] mb-1">Who are you?</h1>
      <p className="text-[12.5px] text-[#8A8064] mb-6">You can add other roles later.</p>
      <div className="space-y-3">
        {roles.map((r) => (
          <button
            key={r.id}
            onClick={() => onSelect(r.id)}
            className="w-full bg-white rounded-2xl border border-[#E9DFC2] p-4 flex items-center gap-3.5 text-left active:bg-[#FAF5E8]"
          >
            <div className="w-11 h-11 rounded-xl bg-[#F1EAD6] flex items-center justify-center shrink-0">
              <r.icon size={20} className="text-[#23305A]" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-[#23305A]">{r.label}</p>
              <p className="text-[11.5px] text-[#8A8064] mt-0.5">{r.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function DetailsScreen({ role, onSubmit, onBack }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [market, setMarket] = useState("Auyo");
  const [lang, setLang] = useState("Hausa");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = name.trim().length > 1 && phone.trim().length >= 10;

  const handleContinue = async () => {
    setError("");
    setSending(true);
    const { ok, phone: normalizedPhone, message } = await sendOtp(phone);
    setSending(false);
    if (!ok) {
      setError(message || "Couldn't send the code. Check the number and try again.");
      return;
    }
    onSubmit({ name, phone: normalizedPhone, market, lang });
  };

  return (
    <div className="min-h-screen px-6 pt-10 pb-8">
      <button onClick={onBack} className="w-8 h-8 rounded-full bg-white border border-[#E9DFC2] flex items-center justify-center mb-6">
        <ChevronLeft size={16} className="text-[#23305A]" />
      </button>
      <h1 className="font-display text-[22px] text-[#23305A] mb-1">Your details</h1>
      <p className="text-[12.5px] text-[#8A8064] mb-6">
        Registering as a {role === "farmer" ? "farmer" : "buyer"}.
      </p>

      <div className="space-y-4">
        <div>
          <label className="text-[12px] font-medium text-[#5C5540] mb-1.5 block">Full name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ibrahim Sule"
            className="w-full bg-white border border-[#E9DFC2] rounded-xl py-2.5 px-3 text-[13.5px] outline-none focus:ring-2 focus:ring-[#D9A62E]"
          />
        </div>
        <div>
          <label className="text-[12px] font-medium text-[#5C5540] mb-1.5 block">Phone number</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="080X XXX XXXX"
            inputMode="numeric"
            className="w-full bg-white border border-[#E9DFC2] rounded-xl py-2.5 px-3 text-[13.5px] outline-none focus:ring-2 focus:ring-[#D9A62E]"
          />
          <p className="text-[10.5px] text-[#B0A883] mt-1">
            This is how buyers/farmers and SMS alerts reach you. We'll text a code to verify it.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[12px] font-medium text-[#5C5540] mb-1.5 block">Home market</label>
            <select
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              className="w-full bg-white border border-[#E9DFC2] rounded-xl py-2.5 px-3 text-[13.5px] outline-none focus:ring-2 focus:ring-[#D9A62E]"
            >
              <option>Auyo</option>
              <option>Kazaure</option>
              <option>Hadejia</option>
            </select>
          </div>
          <div>
            <label className="text-[12px] font-medium text-[#5C5540] mb-1.5 block">Language</label>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="w-full bg-white border border-[#E9DFC2] rounded-xl py-2.5 px-3 text-[13.5px] outline-none focus:ring-2 focus:ring-[#D9A62E]"
            >
              <option>Hausa</option>
              <option>English</option>
            </select>
          </div>
        </div>
      </div>

      {error && <p className="text-[11.5px] text-[#B4482A] mt-4">{error}</p>}

      <button
        disabled={!canSubmit || sending}
        onClick={handleContinue}
        className={`w-full font-semibold text-[14px] rounded-xl py-3.5 mt-7 ${
          canSubmit && !sending
            ? "bg-[#D9A62E] text-[#23305A] active:opacity-80"
            : "bg-[#E9DFC2] text-[#B0A883]"
        }`}
      >
        {sending ? "Sending code…" : "Continue"}
      </button>
    </div>
  );
}

function OtpScreen({ phone, onVerified, onBack }) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const filled = digits.every((d) => d !== "");

  const setDigit = (i, v) => {
    if (!/^[0-9]?$/.test(v)) return;
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    if (v && i < digits.length - 1) document.getElementById(`otp-${i + 1}`)?.focus();
  };

  const submit = async () => {
    setError("");
    setVerifying(true);
    const { ok, session, message } = await verifyOtpCode(phone, digits.join(""));
    setVerifying(false);
    if (!ok) {
      setError(message || "That code didn't match. Check it and try again.");
      return;
    }
    onVerified(session);
  };

  const resend = async () => {
    setError("");
    setResending(true);
    const { ok, message } = await sendOtp(phone);
    setResending(false);
    if (!ok) setError(message || "Couldn't resend the code.");
  };

  return (
    <div className="min-h-screen px-6 pt-10 pb-8 flex flex-col">
      <button onClick={onBack} className="w-8 h-8 rounded-full bg-white border border-[#E9DFC2] flex items-center justify-center mb-6">
        <ChevronLeft size={16} className="text-[#23305A]" />
      </button>
      <h1 className="font-display text-[22px] text-[#23305A] mb-1">Verify your number</h1>
      <p className="text-[12.5px] text-[#8A8064] mb-7">
        We sent a 6-digit code by SMS to {phone || "your number"}.
      </p>

      <div className="flex gap-2 mb-6">
        {digits.map((d, i) => (
          <input
            key={i}
            id={`otp-${i}`}
            value={d}
            onChange={(e) => setDigit(i, e.target.value)}
            inputMode="numeric"
            maxLength={1}
            className="w-11 h-14 text-center text-[18px] font-mono font-semibold bg-white border border-[#E9DFC2] rounded-xl outline-none focus:ring-2 focus:ring-[#D9A62E]"
          />
        ))}
      </div>

      {error && <p className="text-[11.5px] text-[#B4482A] mb-3">{error}</p>}

      <button
        disabled={!filled || verifying}
        onClick={submit}
        className={`w-full font-semibold text-[14px] rounded-xl py-3.5 ${
          filled && !verifying ? "bg-[#D9A62E] text-[#23305A] active:opacity-80" : "bg-[#E9DFC2] text-[#B0A883]"
        }`}
      >
        {verifying ? "Verifying…" : "Verify & finish"}
      </button>
      <button
        onClick={resend}
        disabled={resending}
        className="text-[12px] text-[#8A8064] mt-4 underline underline-offset-2 mx-auto disabled:opacity-60"
      >
        {resending ? "Resending…" : "Resend code"}
      </button>
    </div>
  );
}

function ProfileScreen({ user, onLogout }) {
  return (
    <div className="px-4 pt-5 pb-24">
      <h1 className="font-display text-[22px] text-[#23305A] mb-4">Profile</h1>
      <div className="bg-white rounded-2xl border border-[#E9DFC2] p-4 flex items-center gap-3.5 mb-4">
        <div className="w-14 h-14 rounded-full bg-[#23305A] flex items-center justify-center text-white text-[16px] font-display">
          {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
        </div>
        <div>
          <p className="text-[15px] font-semibold text-[#23305A]">{user.name}</p>
          <p className="text-[11.5px] text-[#8A8064] capitalize">{user.role} · {user.market} market</p>
          <span className="inline-flex items-center gap-1 text-[10px] bg-[#E4EEE3] text-[#4C7A52] px-1.5 py-0.5 rounded-full mt-1">
            <ShieldCheck size={10} /> Phone verified
          </span>
          {!user.verified && (
            <span className="inline-flex items-center gap-1 text-[10px] bg-[#F3E9CE] text-[#8A6A1A] px-1.5 py-0.5 rounded-full mt-1 ml-1.5">
              Account pending admin review
            </span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#E9DFC2] divide-y divide-[#EFE7CE]">
        {[
          { icon: Phone, label: user.phone },
          { icon: MessageSquare, label: `Language: ${user.lang}` },
          { icon: MapPin, label: `Home market: ${user.market}` },
        ].map((row, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <row.icon size={15} className="text-[#8A8064]" />
            <p className="text-[13px] text-[#5C5540]">{row.label}</p>
          </div>
        ))}
      </div>

      <button
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 text-[13px] font-medium text-[#B4482A] mt-6 py-2.5"
      >
        <LogOut size={15} /> Switch account
      </button>
    </div>
  );
}

// ---------- App shell ----------

const AUTH_STEPS = ["welcome", "role", "details", "otp"];

export default function App() {
  const [authStep, setAuthStep] = useState("welcome"); // welcome | role | details | otp | done
  const [pendingRole, setPendingRole] = useState(null);
  const [pendingDetails, setPendingDetails] = useState(null);
  const [user, setUser] = useState(null); // { role, name, phone, market, lang, verified }
  const [checkingSession, setCheckingSession] = useState(true);

  // On load, check if there's already a verified phone-auth session
  // (so a returning user skips registration entirely).
  useEffect(() => {
    async function restoreSession() {
      const { data } = await supabase.auth.getSession();
      const authUser = data.session?.user;
      if (authUser) {
        const profile = await fetchExistingProfile(authUser.id);
        if (profile) {
          setUser(profile);
          setAuthStep("done");
        }
      }
      setCheckingSession(false);
    }
    restoreSession();
  }, []);

  const [tab, setTab] = useState("home");
  const [activeListing, setActiveListing] = useState(null);
  const [contactFor, setContactFor] = useState(null);

  const [prices, setPrices] = useState([]);
  const [listings, setListings] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);

  const loadData = async () => {
    const [p, l] = await Promise.all([fetchPriceData(), fetchListings()]);
    setPrices(p);
    setListings(l);
    setDataLoading(false);
  };

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const tabs = [
    { id: "home", label: "Prices", icon: Home },
    { id: "market", label: "Market", icon: Store },
    { id: "sell", label: "Sell", icon: PlusCircle },
    { id: "deals", label: "Deals", icon: Handshake },
    { id: "profile", label: "Profile", icon: User },
  ];

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setAuthStep("welcome");
    setPendingRole(null);
    setPendingDetails(null);
    setTab("home");
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#FBF7EA] flex items-center justify-center font-sans text-[#8A8064] text-[13px]">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF7EA] flex justify-center font-sans">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .font-display { font-family: 'Fraunces', serif; }
        .font-sans { font-family: 'Inter', sans-serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>

      <div className="w-full max-w-[420px] bg-[#FBF7EA] relative min-h-screen shadow-xl">
        {!user ? (
          <>
            {authStep === "welcome" && <WelcomeScreen onStart={() => setAuthStep("role")} />}
            {authStep === "role" && (
              <RoleSelectScreen
                onBack={() => setAuthStep("welcome")}
                onSelect={(role) => {
                  setPendingRole(role);
                  setAuthStep("details");
                }}
              />
            )}
            {authStep === "details" && (
              <DetailsScreen
                role={pendingRole}
                onBack={() => setAuthStep("role")}
                onSubmit={(details) => {
                  setPendingDetails(details);
                  setAuthStep("otp");
                }}
              />
            )}
            {authStep === "otp" && (
              <OtpScreen
                phone={pendingDetails?.phone}
                onBack={() => setAuthStep("details")}
                onVerified={async (session) => {
                  const authUserId = session.user.id;
                  await completeRegistration({
                    userId: authUserId,
                    phone: pendingDetails.phone,
                    name: pendingDetails.name,
                    role: pendingRole,
                    market: pendingDetails.market,
                    lang: pendingDetails.lang,
                  });
                  setUser({ role: pendingRole, ...pendingDetails, verified: false });
                  setAuthStep("done");
                  setTab("home");
                }}
              />
            )}
          </>
        ) : (
          <>
            {/* Top brand bar */}
            <div className="sticky top-0 z-10 bg-[#FBF7EA]/95 backdrop-blur border-b border-[#EFE7CE] px-4 py-2.5 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-[#23305A] flex items-center justify-center">
                <Wheat size={13} className="text-[#D9A62E]" />
              </div>
              <p className="font-display text-[13.5px] text-[#23305A] tracking-wide">
                Tafasa <span className="text-[#B4482A]">Agrotech</span>
              </p>
            </div>

            {activeListing ? (
              <ListingDetail
                listing={activeListing}
                onBack={() => setActiveListing(null)}
                onContact={() => setContactFor(activeListing)}
                prices={prices}
              />
            ) : (
              <>
                {dataLoading && (
                  <p className="px-4 pt-4 text-[12px] text-[#8A8064]">Loading live data…</p>
                )}
                {tab === "home" && <HomeScreen prices={prices} />}
                {tab === "market" && (
                  <MarketplaceScreen onOpenListing={setActiveListing} listings={listings} prices={prices} />
                )}
                {tab === "sell" && (
                  <SellScreen prices={prices} user={user} onListingPosted={loadData} />
                )}
                {tab === "deals" && <DealsScreen />}
                {tab === "profile" && <ProfileScreen user={user} onLogout={logout} />}
              </>
            )}

            <ContactModal listing={contactFor} onClose={() => setContactFor(null)} />

            {/* Bottom nav */}
            <div className="fixed bottom-0 w-full max-w-[420px] bg-white border-t border-[#EFE7CE] flex justify-around py-2 px-1">
              {tabs.map((t) => {
                const active = tab === t.id && !activeListing;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTab(t.id);
                      setActiveListing(null);
                    }}
                    className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl"
                  >
                    <t.icon
                      size={18}
                      strokeWidth={active ? 2.4 : 1.8}
                      className={active ? "text-[#23305A]" : "text-[#B0A883]"}
                    />
                    <span
                      className={`text-[10px] font-medium ${
                        active ? "text-[#23305A]" : "text-[#B0A883]"
                      }`}
                    >
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
