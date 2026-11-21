import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, setDoc } from 'firebase/firestore';
import {
  Heart,
  Utensils,
  Moon,
  Sun,
  Sparkles,
  Trophy,
  Gamepad2,
  BookOpen,
  Gift,
  Volume2,
  VolumeX,
  Edit3,
  Check,
  X,
  Send,
  Star,
  RotateCcw,
  Smile,
  Zap,
  Droplets,
  Sofa,
  Bath,
  BedDouble,
  Trees,
  Crown,
  Flame,
  Music,
  Play,
  Pause,
  SkipForward,
  Square,
  Clock,
} from 'lucide-react';

// ============================================================================
// REAL-TIME JAKARTA (WIB / Asia/Jakarta) CLOCK & SKY LIGHTING HELPER
// ============================================================================
function getJakartaTimeInfo(nowMs = Date.now()) {
  const date = new Date(nowMs);
  const formattedTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 12) % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);

  let phase = 'day'; // 'morning' | 'day' | 'sunset' | 'night'
  if (hour >= 5 && hour < 10) phase = 'morning';
  else if (hour >= 10 && hour < 16) phase = 'day';
  else if (hour >= 16 && hour < 19) phase = 'sunset';
  else phase = 'night';

  const skyPalette = {
    morning: {
      sky: '#FDE68A',
      skyLower: '#BAE6FD',
      building1: '#CBD5E1',
      building2: '#94A3B8',
      celestial: 'sun',
      sunColor: '#FBBF24',
      ambientTint: '#FEF3C7',
      ambientOpacity: 0.08,
      label: 'Morning',
      icon: '🌅',
    },
    day: {
      sky: '#BAE6FD',
      skyLower: '#E0F2FE',
      building1: '#B8D4E8',
      building2: '#9EC1DB',
      celestial: 'sun',
      sunColor: '#FDE047',
      ambientTint: '#FFFFFF',
      ambientOpacity: 0,
      label: 'Day',
      icon: '☀️',
    },
    sunset: {
      sky: '#FDBA74',
      skyLower: '#FDA4AF',
      building1: '#7C5E78',
      building2: '#5B4358',
      celestial: 'sun',
      sunColor: '#F97316',
      ambientTint: '#FB923C',
      ambientOpacity: 0.14,
      label: 'Sunset',
      icon: '🌇',
    },
    night: {
      sky: '#0F172A',
      skyLower: '#1E293B',
      building1: '#1E293B',
      building2: '#334155',
      celestial: 'moon',
      sunColor: '#FEF08A',
      ambientTint: '#0F172A',
      ambientOpacity: 0.24,
      label: 'Night',
      icon: '🌙',
    },
  }[phase];

  return {
    formattedTime,
    hour,
    minute,
    phase,
    isNight: phase === 'night',
    skyPalette,
  };
}

// Compute smart Jakarta (WIB) wake-up timestamp:
// - Bedtime between 20:00 - 04:00 WIB -> auto wakes between 05:00 - 06:00 WIB
// - Daytime nap outside 20:00 - 04:00 WIB -> auto wakes after 15 minutes
function computeJakartaWakeAt(nowMs = Date.now()) {
  const { hour } = getJakartaTimeInfo(nowMs);
  const isBedtimeWindow = hour >= 20 || hour < 4;
  if (!isBedtimeWindow) {
    return nowMs + 15 * 60 * 1000;
  }

  // Build next 05:00:00 WIB timestamp + random 0..59 minutes (05:00 - 05:59 WIB)
  const jakartaFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const baseDate = hour >= 20 ? new Date(nowMs + 24 * 60 * 60 * 1000) : new Date(nowMs);
  const dateStr = jakartaFormatter.format(baseDate); // YYYY-MM-DD in Jakarta
  const randomMin = Math.floor(Math.random() * 60);
  const mm = String(randomMin).padStart(2, '0');
  const targetIso = `${dateStr}T05:${mm}:00+07:00`;
  const parsed = Date.parse(targetIso);
  return Number.isNaN(parsed) ? nowMs + 8 * 60 * 60 * 1000 : parsed;
}

function formatWakeTimeWIB(wakeAtMs) {
  if (!wakeAtMs) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(wakeAtMs));
}

// ============================================================================
// SHARED MUSIC PLAYLIST (DROP MP3s INTO public/music/ & LIST THEM IN tracks.json)
// ============================================================================
const DEFAULT_PLAYLIST = [
  { id: 'track_1', title: 'Cozy Home Theme 1', file: '/music/song1.mp3' },
  { id: 'track_2', title: 'Cozy Home Theme 2', file: '/music/song2.mp3' },
  { id: 'track_3', title: 'Cozy Home Theme 3', file: '/music/song3.mp3' },
];

// ============================================================================
// FIREBASE LIVE COUPLE SYNC CONFIGURATION (CONNECTED TO ronald-ulfah-pet)
// ============================================================================
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBuZxYU5XIuy1DgZTrR20Vs1REK8Z1mx6o',
  authDomain: 'ronald-ulfah-pet.firebaseapp.com',
  projectId: 'ronald-ulfah-pet',
  storageBucket: 'ronald-ulfah-pet.firebasestorage.app',
  messagingSenderId: '500636307144',
  appId: '1:500636307144:web:db3f5fd87cf85137229ffd',
  measurementId: 'G-36N6K6MN1L',
};
const SHARED_COUPLE_ROOM_ID = 'ronald_and_ulfah_shared_home';

let db = null;
const isFirebaseConfigured =
  FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith('PASTE_');
if (isFirebaseConfigured) {
  try {
    const fbApp = initializeApp(FIREBASE_CONFIG);
    db = getFirestore(fbApp);
  } catch {
    db = null;
  }
}

// ============================================================================
// CONSTANTS, CATALOGS & UTILITIES
// ============================================================================
const STORAGE_KEY = 'ronald_ulfah_shared_pet_world_v3';
const USER_STORAGE_KEY = 'ronald_ulfah_remembered_user_v1';
const GACHA_COST = 150;
const DAILY_BONUS_COINS = 45;

const ROOMS = [
  { id: 'living', label: 'Living Room', shortLabel: 'Living' },
  { id: 'dining', label: 'Dining Room', shortLabel: 'Dining' },
  { id: 'bathroom', label: 'Bathroom', shortLabel: 'Bath' },
  { id: 'bedroom', label: 'Bedroom', shortLabel: 'Bed' },
  { id: 'park', label: 'Pet Park', shortLabel: 'Park' },
];

const FOOD_MENU = [
  { id: 'strawberry', name: 'Strawberry', emoji: '🍓', cost: 15, hunger: 18, happiness: 10 },
  { id: 'boba', name: 'Boba Tea', emoji: '🧋', cost: 25, hunger: 25, happiness: 18 },
  { id: 'ramen', name: 'Warm Ramen', emoji: '🍜', cost: 40, hunger: 45, happiness: 20 },
  { id: 'cake', name: 'Shortcake', emoji: '🍰', cost: 55, hunger: 35, happiness: 38 },
];

const COOKING_RECIPES = [
  { id: 'fried_egg', name: 'Fried Egg', emoji: '🍳', ingredientCost: 10, hunger: 32, happiness: 22 },
  { id: 'pancakes', name: 'Fluffy Pancakes', emoji: '🥞', ingredientCost: 18, hunger: 42, happiness: 30 },
  { id: 'cheese_toast', name: 'Cheese Toast', emoji: '🥪', ingredientCost: 15, hunger: 38, happiness: 26 },
  { id: 'heart_bento', name: 'Heart Bento', emoji: '🍱', ingredientCost: 28, hunger: 58, happiness: 42 },
];

const OUTFIT_CATALOG = [
  // HATS
  { id: 'hat_crown', slot: 'hat', name: 'Royal Crown', emoji: '👑', cost: 850, desc: 'Shiny gold crown fit for royalty' },
  { id: 'hat_party', slot: 'hat', name: 'Party Cone', emoji: '🥳', cost: 550, desc: 'Striped celebration hat' },
  { id: 'hat_frog', slot: 'hat', name: 'Froggy Hood', emoji: '🐸', cost: 680, desc: 'Cute green frog ears cap' },
  { id: 'hat_beret', slot: 'hat', name: 'Artist Beret', emoji: '🎨', cost: 600, desc: 'Cozy Parisian strawberry beret' },
  { id: 'hat_sprout', slot: 'hat', name: 'Leaf Sprout', emoji: '🌱', cost: 500, desc: 'Fresh little garden leaf' },
  { id: 'hat_wizard', slot: 'hat', name: 'Starry Wizard', emoji: '🧙', cost: 980, desc: 'Magical midnight wizard hat' },
  { id: 'hat_bunny', slot: 'hat', name: 'Bunny Ears', emoji: '🐰', cost: 680, desc: 'Fluffy pink & white bunny ears' },
  { id: 'hat_halo', slot: 'hat', name: 'Angel Halo', emoji: '😇', cost: 900, desc: 'Floating golden angel ring' },
  // SHIRTS & NECKWEAR
  { id: 'shirt_bow', slot: 'shirt', name: 'Dapper Bowtie', emoji: '🎀', cost: 500, desc: 'Sweet pastel ribbon bow' },
  { id: 'shirt_scarf', slot: 'shirt', name: 'Cozy Scarf', emoji: '🧣', cost: 550, desc: 'Warm winter knit scarf' },
  { id: 'shirt_sailor', slot: 'shirt', name: 'Sailor Collar', emoji: '⚓', cost: 750, desc: 'Classic navy & white sailor top' },
  { id: 'shirt_overalls', slot: 'shirt', name: 'Denim Overalls', emoji: '👖', cost: 820, desc: 'Adorable tiny blue overalls' },
  { id: 'shirt_hoodie', slot: 'shirt', name: 'Pink Hoodie', emoji: '👚', cost: 750, desc: 'Soft strawberry fleece hoodie' },
  { id: 'shirt_tux', slot: 'shirt', name: 'Mini Tuxedo', emoji: '🤵', cost: 1050, desc: 'Fancy formal couple date tux' },
  { id: 'shirt_flowers', slot: 'shirt', name: 'Sakura Lei', emoji: '🌸', cost: 620, desc: 'Cherry blossom petal garland' },
  { id: 'shirt_cape', slot: 'shirt', name: 'Hero Cape', emoji: '🦸', cost: 900, desc: 'Super-pet crimson cape' },
  // FULL COSTUMES
  { id: 'costume_bee', slot: 'costume', name: 'Bumblebee Suit', emoji: '🐝', cost: 1250, desc: 'Striped bee hood & tiny wings' },
  { id: 'costume_dino', slot: 'costume', name: 'Dino Onesie', emoji: '🦖', cost: 1350, desc: 'Spiky green dinosaur pajamas' },
  { id: 'costume_astro', slot: 'costume', name: 'Space Helmet', emoji: '🚀', cost: 1500, desc: 'Glass astronaut bubble visor' },
  { id: 'costume_strawberry', slot: 'costume', name: 'Berry Suit', emoji: '🍓', cost: 1200, desc: 'Plump sweet strawberry costume' },
  { id: 'costume_ghost', slot: 'costume', name: 'Boo Sheet', emoji: '👻', cost: 1150, desc: 'Playful spooky ghost sheet' },
  { id: 'costume_panda', slot: 'costume', name: 'Panda Hoodie', emoji: '🐼', cost: 1420, desc: 'Fluffy black & white panda suit' },
];

const RARITY_STYLES = {
  Common: 'bg-amber-100 text-amber-800 border-amber-300',
  Rare: 'bg-sky-100 text-sky-800 border-sky-300',
  Epic: 'bg-purple-100 text-purple-800 border-purple-300',
  Legendary: 'bg-rose-100 text-rose-700 border-rose-300',
};

const PET_ANIMATION_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap');
  .playful-font {
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  }
  .serif-display {
    font-family: 'Fraunces', Georgia, serif;
  }
  .paper-grain {
    background-color: #FAF6F0;
    background-image: radial-gradient(#D6C7B2 0.75px, transparent 0.75px);
    background-size: 16px 16px;
  }
  @keyframes petBreathe {
    0%, 100% { transform: scale(1, 1) translateY(0px); }
    50% { transform: scale(1.05, 0.94) translateY(2px); }
  }
  @keyframes petWaddle {
    0%, 100% { transform: translateY(0px) rotate(-6deg) scale(1.03, 0.96); }
    50% { transform: translateY(-9px) rotate(6deg) scale(0.96, 1.05); }
  }
  @keyframes petHappyJump {
    0%, 100% { transform: translateY(0px) scale(1, 1); }
    25% { transform: translateY(-16px) scale(0.93, 1.09); }
    50% { transform: translateY(0px) scale(1.11, 0.89); }
    75% { transform: translateY(-8px) scale(0.97, 1.04); }
  }
  @keyframes petWaiting {
    0%, 100% { transform: translateY(0px) rotate(-3deg) scale(1.03, 0.97); }
    50% { transform: translateY(-4px) rotate(3deg) scale(0.98, 1.03); }
  }
  @keyframes petFloat {
    0%, 100% { transform: translateY(0px) rotate(-2deg); }
    50% { transform: translateY(-8px) rotate(2deg); }
  }
  @keyframes petNibble {
    0%, 100% { transform: scale(1, 1); }
    50% { transform: scale(1.1, 0.9); }
  }
  @keyframes petBlink {
    0%, 92%, 100% { transform: scaleY(1); }
    95% { transform: scaleY(0.12); }
  }
  @keyframes petTail {
    0%, 100% { transform: rotate(-9deg); }
    50% { transform: rotate(9deg); }
  }
  @keyframes petEar {
    0%, 100% { transform: rotate(0deg); }
    35% { transform: rotate(-7deg); }
    70% { transform: rotate(5deg); }
  }
  @keyframes petWing {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(-16deg); }
  }
  @keyframes petTwinkle {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.45; transform: scale(0.75); }
  }
  @keyframes petTilt {
    0%, 100% { transform: rotate(-6deg); }
    50% { transform: rotate(6deg); }
  }
  @keyframes petBubble {
    0% { opacity: 1; transform: translate(-50%, 0px) scale(0.9); }
    100% { opacity: 0; transform: translate(-50%, -28px) scale(1.25); }
  }
  @keyframes petZzz {
    0%, 100% { transform: translateY(0px) scale(0.92); opacity: 0.75; }
    50% { transform: translateY(-6px) scale(1.08); opacity: 1; }
  }
  @keyframes fireDanceOuter {
    0%, 100% { transform: scale(1, 1) skewX(-3deg); }
    25% { transform: scale(0.94, 1.09) skewX(3deg); }
    50% { transform: scale(1.05, 0.95) skewX(-2deg); }
    75% { transform: scale(0.96, 1.07) skewX(4deg); }
  }
  @keyframes fireDanceInner {
    0%, 100% { transform: scale(1, 1) skewX(4deg); }
    33% { transform: scale(1.08, 0.92) skewX(-4deg); }
    66% { transform: scale(0.92, 1.1) skewX(2deg); }
  }
  @keyframes fireGlow {
    0%, 100% { opacity: 0.34; transform: scale(1); }
    50% { opacity: 0.54; transform: scale(1.08); }
  }
  @keyframes fireSpark {
    0% { transform: translateY(0px) translateX(0px) scale(1); opacity: 0.95; }
    50% { transform: translateY(-16px) translateX(3px) scale(0.8); opacity: 0.85; }
    100% { transform: translateY(-32px) translateX(-2px) scale(0.2); opacity: 0; }
  }
  .pet-breathe { animation: petBreathe 2.6s ease-in-out infinite; transform-origin: center bottom; }
  .pet-waddle { animation: petWaddle 0.34s ease-in-out infinite; transform-origin: center bottom; }
  .pet-happy-jump { animation: petHappyJump 0.52s ease-in-out infinite; transform-origin: center bottom; }
  .pet-waiting { animation: petWaiting 0.8s ease-in-out infinite; transform-origin: center bottom; }
  .pet-float { animation: petFloat 2.4s ease-in-out infinite; transform-origin: center center; }
  .pet-nibble { animation: petNibble 0.28s ease-in-out infinite; transform-origin: center bottom; }
  .pet-blink { animation: petBlink 3.8s ease-in-out infinite; transform-origin: center center; }
  .pet-tail { animation: petTail 1.1s ease-in-out infinite; }
  .pet-ear { animation: petEar 2.4s ease-in-out infinite; }
  .pet-wing { animation: petWing 0.6s ease-in-out infinite; }
  .pet-twinkle { animation: petTwinkle 1.4s ease-in-out infinite; }
  .pet-tilt { animation: petTilt 1.6s ease-in-out infinite; }
  .pet-bubble { animation: petBubble 0.85s ease-out forwards; }
  .pet-zzz { animation: petZzz 1.8s ease-in-out infinite; }
  .fire-outer { animation: fireDanceOuter 0.95s ease-in-out infinite; transform-origin: 58px 350px; }
  .fire-mid { animation: fireDanceInner 0.72s ease-in-out infinite; transform-origin: 58px 350px; }
  .fire-core { animation: fireDanceOuter 0.55s ease-in-out infinite; transform-origin: 58px 350px; }
  .fire-glow { animation: fireGlow 1.4s ease-in-out infinite; transform-origin: 58px 338px; }
  .fire-spark-1 { animation: fireSpark 1.6s ease-out infinite; }
  .fire-spark-2 { animation: fireSpark 2.0s ease-out infinite 0.55s; }
  .fire-spark-3 { animation: fireSpark 1.4s ease-out infinite 1.1s; }
`;

const PET_SPECIES = [
  // Row 1: Furry Friends
  { id: 'orange_cat', category: 'Furry Friends', speciesName: 'Ginger Tabby Cat', defaultName: 'Mochi', rarity: 'Common', weight: 14, bg: 'from-orange-50 to-amber-100', border: 'border-orange-200' },
  { id: 'shiba_inu', category: 'Furry Friends', speciesName: 'Shiba Inu', defaultName: 'Boba', rarity: 'Common', weight: 14, bg: 'from-amber-50 to-yellow-100', border: 'border-amber-200' },
  { id: 'carrot_bunny', category: 'Furry Friends', speciesName: 'Carrot Bunny', defaultName: 'Pip', rarity: 'Common', weight: 14, bg: 'from-orange-50 to-stone-100', border: 'border-stone-200' },
  { id: 'golden_hamster', category: 'Furry Friends', speciesName: 'Golden Hamster', defaultName: 'Nugget', rarity: 'Common', weight: 13, bg: 'from-yellow-50 to-orange-100', border: 'border-amber-200' },
  // Row 2: Birds & Reptiles
  { id: 'blue_macaw', category: 'Birds & Reptiles', speciesName: 'Blue Macaw', defaultName: 'Rio', rarity: 'Rare', weight: 9, bg: 'from-sky-50 to-cyan-100', border: 'border-sky-200' },
  { id: 'meadow_turtle', category: 'Birds & Reptiles', speciesName: 'Meadow Turtle', defaultName: 'Matcha', rarity: 'Rare', weight: 9, bg: 'from-emerald-50 to-lime-100', border: 'border-emerald-200' },
  { id: 'fluffy_bluebird', category: 'Birds & Reptiles', speciesName: 'Fluffy Bluebird', defaultName: 'Sky', rarity: 'Rare', weight: 9, bg: 'from-blue-50 to-sky-100', border: 'border-blue-200' },
  { id: 'coral_chameleon', category: 'Birds & Reptiles', speciesName: 'Coral Chameleon', defaultName: 'Tango', rarity: 'Rare', weight: 8, bg: 'from-rose-50 to-emerald-100', border: 'border-rose-200' },
  // Row 3: Fantasy & Magical
  { id: 'baby_dragon', category: 'Fantasy & Magical', speciesName: 'Baby Dragon', defaultName: 'Ember', rarity: 'Epic', weight: 5, bg: 'from-orange-100 to-pink-100', border: 'border-pink-300' },
  { id: 'cosmic_star', category: 'Fantasy & Magical', speciesName: 'Cosmic Star', defaultName: 'Nova', rarity: 'Legendary', weight: 3, bg: 'from-indigo-100 to-purple-100', border: 'border-indigo-300' },
  { id: 'mini_griffin', category: 'Fantasy & Magical', speciesName: 'Mini Griffin', defaultName: 'Apollo', rarity: 'Epic', weight: 5, bg: 'from-amber-100 to-yellow-100', border: 'border-amber-300' },
  { id: 'rainbow_unicorn', category: 'Fantasy & Magical', speciesName: 'Rainbow Unicorn', defaultName: 'Starlight', rarity: 'Legendary', weight: 3, bg: 'from-fuchsia-100 to-sky-100', border: 'border-purple-300' },
  // Row 4: Aquatic & Tiny
  { id: 'fancy_goldfish', category: 'Aquatic & Tiny', speciesName: 'Fancy Goldfish', defaultName: 'Bubbles', rarity: 'Common', weight: 10, bg: 'from-cyan-50 to-sky-100', border: 'border-cyan-200' },
  { id: 'woodland_owl', category: 'Aquatic & Tiny', speciesName: 'Woodland Owl', defaultName: 'Hootie', rarity: 'Rare', weight: 8, bg: 'from-amber-50 to-stone-200', border: 'border-amber-300' },
  { id: 'lilypad_frog', category: 'Aquatic & Tiny', speciesName: 'Lilypad Frog', defaultName: 'Keropi', rarity: 'Common', weight: 10, bg: 'from-green-50 to-emerald-100', border: 'border-green-200' },
  { id: 'space_hamster', category: 'Aquatic & Tiny', speciesName: 'Space Hamster', defaultName: 'Astro', rarity: 'Legendary', weight: 3, bg: 'from-slate-100 to-indigo-100', border: 'border-indigo-300' },
];

const clamp = (val, min = 0, max = 100) => Math.min(max, Math.max(min, val));

const getSpecies = (id) => PET_SPECIES.find((s) => s.id === id) || PET_SPECIES[0];

const rollGachaSpecies = () => {
  const total = PET_SPECIES.reduce((sum, s) => sum + s.weight, 0);
  let r = Math.random() * total;
  for (const spec of PET_SPECIES) {
    r -= spec.weight;
    if (r <= 0) return spec;
  }
  return PET_SPECIES[0];
};

const getTodayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

const formatAge = (ms) => {
  const totalMins = Math.max(1, Math.floor(ms / 60000));
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins % (60 * 24)) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

const getGrowthStage = (ageMs) => {
  const days = ageMs / 86400000;
  if (days < 1) return { stage: 'Baby', scale: 0.9, nextLabel: 'Kid at Day 1' };
  if (days < 3) return { stage: 'Kid', scale: 0.96, nextLabel: 'Teen at Day 3' };
  if (days < 7) return { stage: 'Teen', scale: 1.02, nextLabel: 'Adult at Day 7' };
  if (days < 14) return { stage: 'Adult', scale: 1.07, nextLabel: 'Elder at Day 14' };
  return { stage: 'Elder', scale: 1.12, nextLabel: 'Max Stage' };
};

const createInitialWorld = () => {
  const adoptedAt = Date.now() - 45 * 60000;
  return {
    coins: 220,
    streak: 1,
    lastDailyClaim: '',
    loveNote: {
      text: "Let's take care of Mochi together every day!",
      author: 'Ronald & Ulfah',
      updatedAt: adoptedAt,
    },
    activePetId: 'starter_mochi',
    cookedInventory: {},
    ownedOutfits: ['shirt_bow'],
    pets: {
      starter_mochi: {
        id: 'starter_mochi',
        speciesId: 'orange_cat',
        name: 'Mochi',
        adoptedAt,
        adoptedBy: 'Ronald & Ulfah',
        stars: 1,
        hunger: 82,
        happiness: 88,
        energy: 86,
        hygiene: 90,
        potty: 18,
        outfit: { hat: null, shirt: 'shirt_bow', costume: null },
        isSleeping: false,
        lastUpdated: Date.now(),
      },
    },
    activities: [
      {
        id: 'init_1',
        actor: 'Ronald & Ulfah',
        text: 'welcomed Mochi the Ginger Tabby Cat to their cozy home!',
        emoji: '🐾',
        timestamp: adoptedAt,
      },
    ],
    scores: [],
  };
};

// Web Audio Cozy SFX Engine
let sharedAudioCtx = null;
function playSfx(type, muted = false) {
  if (muted || typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx) sharedAudioCtx = new AudioCtx();
    if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume();
    const ctx = sharedAudioCtx;
    const now = ctx.currentTime;

    const tone = (freq, dur, wave = 'sine', vol = 0.08, delay = 0, slideTo = null) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, now + delay);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + delay + dur);
      gain.gain.setValueAtTime(0.001, now + delay);
      gain.gain.linearRampToValueAtTime(vol, now + delay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + dur + 0.02);
    };

    const noiseBurst = (dur, vol = 0.04, filterFreq = 2400) => {
      const bufferSize = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = filterFreq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);
    };

    switch (type) {
      case 'cuddle':
        tone(523, 0.12, 'sine', 0.07, 0);
        tone(659, 0.16, 'sine', 0.07, 0.07);
        break;
      case 'eat':
        tone(340, 0.08, 'triangle', 0.07, 0, 480);
        tone(420, 0.09, 'triangle', 0.07, 0.11, 560);
        break;
      case 'sleep':
        tone(440, 0.22, 'sine', 0.06, 0, 330);
        tone(330, 0.3, 'sine', 0.05, 0.16, 261);
        break;
      case 'bath':
        tone(620 + Math.random() * 260, 0.09, 'sine', 0.05, 0, 960);
        break;
      case 'flush':
        noiseBurst(0.45, 0.05, 900);
        tone(480, 0.35, 'sine', 0.05, 0.05, 190);
        break;
      case 'coin':
      case 'catch':
        tone(784, 0.09, 'sine', 0.07, 0);
        tone(1046, 0.14, 'sine', 0.07, 0.07);
        break;
      case 'match':
        tone(587, 0.1, 'triangle', 0.07, 0);
        tone(880, 0.14, 'triangle', 0.07, 0.08);
        break;
      case 'perfect':
        tone(659, 0.09, 'triangle', 0.08, 0);
        tone(880, 0.1, 'triangle', 0.08, 0.07);
        tone(1174, 0.18, 'sine', 0.08, 0.14);
        break;
      case 'miss':
        tone(220, 0.18, 'sawtooth', 0.05, 0, 140);
        break;
      case 'chop':
        tone(280, 0.05, 'triangle', 0.08, 0, 140);
        noiseBurst(0.04, 0.04, 1800);
        break;
      case 'sizzle':
      case 'panSizzle': {
        noiseBurst(0.55, 0.065, 3400);
        noiseBurst(0.45, 0.04, 6200);
        const popCount = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < popCount; i++) {
          const popDelay = Math.random() * 0.42;
          tone(1600 + Math.random() * 1400, 0.025, 'sine', 0.03, popDelay, 900);
        }
        break;
      }
      case 'flip':
        tone(260, 0.14, 'sine', 0.07, 0, 680);
        setTimeout(() => {
          if (!muted) {
            noiseBurst(0.45, 0.08, 4200);
            tone(1900, 0.03, 'sine', 0.035, 0.05, 1100);
          }
        }, 160);
        break;
      case 'cookDone':
      case 'gacha':
        tone(523, 0.12, 'triangle', 0.08, 0);
        tone(659, 0.12, 'triangle', 0.08, 0.09);
        tone(784, 0.12, 'triangle', 0.08, 0.18);
        tone(1046, 0.25, 'sine', 0.09, 0.27);
        break;
      default:
        tone(520, 0.08, 'sine', 0.06, 0);
    }
  } catch {
    // Ignore audio context restrictions
  }
}

// ============================================================================
// CUSTOM ROBLOX COUPLE AVATARS (ULFAH & RONALD)
// ============================================================================
function CoupleAvatar({ player, size = 76 }) {
  const isUlfah = player === 'Ulfah';
  return (
    <div
      className="relative inline-flex items-center justify-center select-none shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 120 132"
        className="w-full h-full overflow-visible"
        style={{
          filter:
            'drop-shadow(0px 0px 2px #ffffff) drop-shadow(0px 0px 2px #ffffff) drop-shadow(0px 4px 6px rgba(59,38,24,0.18))',
        }}
      >
        {isUlfah ? (
          <g strokeLinecap="round" strokeLinejoin="round">
            <path d="M 38 40 Q 28 66 32 90 L 40 90 Q 38 66 44 44 Z" fill="#8C7160" stroke="#4A372B" strokeWidth="2.2" />
            <path d="M 82 40 Q 92 66 88 90 L 80 90 Q 82 66 76 44 Z" fill="#8C7160" stroke="#4A372B" strokeWidth="2.2" />
            <g transform="rotate(-38 44 58)">
              <rect x="20" y="52" width="24" height="10" rx="5" fill="#18181B" stroke="#09090B" strokeWidth="2.2" />
              <rect x="11" y="51" width="11" height="12" rx="4" fill="#F3D6C6" stroke="#8C6D56" strokeWidth="2" />
            </g>
            <g transform="rotate(32 76 58)">
              <rect x="76" y="52" width="24" height="10" rx="5" fill="#18181B" stroke="#09090B" strokeWidth="2.2" />
              <rect x="98" y="51" width="11" height="12" rx="4" fill="#F3D6C6" stroke="#8C6D56" strokeWidth="2" />
            </g>
            <rect x="41" y="84" width="16" height="16" fill="#F3D6C6" stroke="#8C6D56" strokeWidth="2" />
            <rect x="63" y="84" width="16" height="16" fill="#F3D6C6" stroke="#8C6D56" strokeWidth="2" />
            <rect x="39" y="96" width="19" height="30" rx="4" fill="#F4F4F5" stroke="#A1A1AA" strokeWidth="2.2" />
            <path d="M 40 104 H 57 M 40 112 H 57 M 40 120 H 57" stroke="#D4D4D8" strokeWidth="1.8" />
            <rect x="62" y="96" width="19" height="28" rx="4" fill="#F4F4F5" stroke="#A1A1AA" strokeWidth="2.2" />
            <path d="M 63 104 H 80 M 63 112 H 80" stroke="#D4D4D8" strokeWidth="1.8" />
            <polygon points="73,106 68,103 68,109" fill="#F4A6B8" stroke="#9D4E63" strokeWidth="1.2" />
            <polygon points="73,106 78,103 78,109" fill="#F4A6B8" stroke="#9D4E63" strokeWidth="1.2" />
            <circle cx="73" cy="106" r="1.5" fill="#FCE7F3" />
            <rect x="40" y="79" width="40" height="10" rx="3" fill="#64829E" stroke="#334155" strokeWidth="2.2" />
            <path d="M 43 52 L 77 52 L 74 82 L 46 82 Z" fill="#18181B" stroke="#09090B" strokeWidth="2.4" />
            <path d="M 50 52 Q 60 60 70 52" fill="#F3D6C6" stroke="#09090B" strokeWidth="2" />
            <path d="M 52 53 L 60 66 L 68 53" fill="none" stroke="#D4D4D8" strokeWidth="1.4" />
            <line x1="60" y1="66" x2="60" y2="73" stroke="#E4E4E7" strokeWidth="1.6" />
            <rect x="54" y="45" width="12" height="9" rx="3" fill="#F3D6C6" />
            <rect x="39" y="14" width="42" height="35" rx="14" fill="#F6DDD0" stroke="#5C3D2E" strokeWidth="2.4" />
            <path
              d="M 38 30 C 37 14 48 8 60 8 C 72 8 83 14 82 30 C 80 22 72 18 65 16 C 61 24 50 28 38 30 Z"
              fill="#8C7160"
              stroke="#4A372B"
              strokeWidth="2.3"
            />
            <ellipse cx="47" cy="37" rx="4.5" ry="2.6" fill="#F497A9" opacity="0.75" />
            <ellipse cx="73" cy="37" rx="4.5" ry="2.6" fill="#F497A9" opacity="0.75" />
            <circle cx="50" cy="32" r="4.2" fill="#3B2618" />
            <circle cx="48.6" cy="30.6" r="1.5" fill="#FFFFFF" />
            <path d="M 66 32 Q 70 28 74 32" fill="none" stroke="#3B2618" strokeWidth="2.6" />
            <path d="M 56 38 Q 58 41 60 38 Q 62 41 64 38" fill="none" stroke="#3B2618" strokeWidth="2.2" />
          </g>
        ) : (
          <g strokeLinecap="round" strokeLinejoin="round">
            <rect x="40" y="84" width="19" height="40" rx="2" fill="#18181B" stroke="#09090B" strokeWidth="2.3" />
            <rect x="61" y="84" width="19" height="40" rx="2" fill="#18181B" stroke="#09090B" strokeWidth="2.3" />
            <line x1="46" y1="86" x2="46" y2="122" stroke="#52525B" strokeWidth="1.2" />
            <line x1="53" y1="86" x2="53" y2="122" stroke="#52525B" strokeWidth="1.2" />
            <line x1="67" y1="86" x2="67" y2="122" stroke="#52525B" strokeWidth="1.2" />
            <line x1="74" y1="86" x2="74" y2="122" stroke="#52525B" strokeWidth="1.2" />
            <rect x="23" y="48" width="16" height="38" rx="3" fill="#E4E4E7" stroke="#3F3F46" strokeWidth="2.3" />
            <rect x="81" y="48" width="16" height="38" rx="3" fill="#E4E4E7" stroke="#3F3F46" strokeWidth="2.3" />
            <rect x="39" y="48" width="42" height="38" rx="3" fill="#F4F4F5" stroke="#3F3F46" strokeWidth="2.3" />
            <polygon points="52,48 60,55 68,48" fill="#FFFFFF" stroke="#52525B" strokeWidth="1.8" />
            <polygon points="57,54 63,54 64,79 60,83 56,79" fill="#18181B" stroke="#09090B" strokeWidth="1.8" />
            <polygon points="39,72 72,48 81,48 39,81" fill="#18181B" stroke="#09090B" strokeWidth="2" />
            <rect x="64" y="51" width="9" height="8" rx="1.5" fill="none" stroke="#EAB308" strokeWidth="2.2" transform="rotate(-36 68 55)" />
            <polygon points="53,66 57,63 61,66 57,70" fill="#E0F2FE" stroke="#FACC15" strokeWidth="1.5" />
            <polygon points="44,73 48,70 52,73 48,77" fill="#E0F2FE" stroke="#FACC15" strokeWidth="1.5" />
            <rect x="42" y="18" width="36" height="30" rx="11" fill="#18181B" stroke="#09090B" strokeWidth="2.3" />
            <path
              d="M 45 29 Q 60 27 75 29 L 74 38 Q 67 40 60 35 Q 53 40 46 38 Z"
              fill="#09090B"
              stroke="#E4E4E7"
              strokeWidth="2.4"
            />
            <path
              d="M 38 32 L 32 24 L 39 22 L 35 13 L 45 15 L 47 6 L 55 12 L 60 4 L 65 12 L 73 6 L 75 15 L 85 13 L 81 22 L 88 24 L 82 32 L 77 25 L 68 23 L 60 25 L 52 23 L 43 25 Z"
              fill="#121215"
              stroke="#09090B"
              strokeWidth="2.2"
            />
          </g>
        )}
      </svg>
    </div>
  );
}

// ============================================================================
// BOTTOM ROOM DOCK KAWAII STICKER ICONS
// ============================================================================
function RoomDockIcon({ roomId, active }) {
  return (
    <svg
      viewBox="0 0 64 56"
      className={`w-12 h-11 overflow-visible transition-transform duration-200 ${active ? 'scale-115 -translate-y-1.5' : 'scale-95 opacity-90'}`}
      style={{
        filter: 'drop-shadow(0 0 2px #fff) drop-shadow(0 0 2px #fff) drop-shadow(0 3px 4px rgba(120,70,30,0.2))',
      }}
    >
      {roomId === 'living' && (
        <g stroke="#292524" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="8" y="24" width="48" height="20" rx="6" fill="#475569" />
          <rect x="12" y="28" width="18" height="12" rx="3" fill="#64748B" />
          <rect x="34" y="28" width="18" height="12" rx="3" fill="#64748B" />
          <line x1="14" y1="44" x2="14" y2="49" />
          <line x1="50" y1="44" x2="50" y2="49" />
        </g>
      )}
      {roomId === 'dining' && (
        <g stroke="#292524" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="32" cy="24" rx="22" ry="8" fill="#F8FAFC" />
          <rect x="29" y="32" width="6" height="14" rx="2" fill="#334155" />
          <line x1="20" y1="46" x2="44" y2="46" strokeWidth="3" />
          <ellipse cx="32" cy="24" rx="8" ry="3.5" fill="#CBD5E1" />
        </g>
      )}
      {roomId === 'bathroom' && (
        <g stroke="#292524" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="10" y="24" width="44" height="22" rx="8" fill="#FFFFFF" />
          <rect x="14" y="26" width="36" height="6" rx="3" fill="#BAE6FD" />
          <line x1="48" y1="16" x2="48" y2="24" strokeWidth="2.5" />
        </g>
      )}
      {roomId === 'bedroom' && (
        <g stroke="#292524" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="8" y="32" width="48" height="12" rx="4" fill="#D6B48C" />
          <rect x="12" y="22" width="40" height="12" rx="4" fill="#F8FAFC" />
          <rect x="16" y="24" width="13" height="6" rx="2.5" fill="#E2E8F0" />
          <rect x="35" y="24" width="13" height="6" rx="2.5" fill="#E2E8F0" />
        </g>
      )}
      {roomId === 'park' && (
        <g stroke="#292524" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="10" y="38" width="44" height="8" rx="3" fill="#B47B48" />
          <rect x="29" y="24" width="6" height="14" fill="#57534E" />
          <circle cx="32" cy="18" r="11" fill="#65A30D" />
          <circle cx="22" cy="22" r="7.5" fill="#84CC16" />
          <circle cx="42" cy="22" r="7.5" fill="#84CC16" />
        </g>
      )}
    </svg>
  );
}

// ============================================================================
// 5 MODERN ARCHITECTURAL INTERACTIVE ROOMS (WITH LIVE JAKARTA TIME WINDOWS)
// ============================================================================
function IllustratedRoomBackdrop({
  roomId,
  isSleeping,
  jakartaTime,
  isPetOnBed,
  showHints,
  onSofaClick,
  onTableClick,
  onStoveClick,
  onBedClick,
  onLampClick,
  onTubClick,
  onToiletClick,
  onWardrobeClick,
  onBoardClick,
  onParkPlayClick,
}) {
  const hintStyle = {
    opacity: showHints ? 1 : 0,
    transition: 'opacity 320ms ease-out',
    pointerEvents: 'none',
  };

  const sky = jakartaTime?.skyPalette || getJakartaTimeInfo().skyPalette;
  const phase = jakartaTime?.phase || 'day';
  const jHour = jakartaTime?.hour ?? 12;
  const jMinute = jakartaTime?.minute ?? 0;

  // Real Jakarta clock hands for the Bedroom wall clock
  const hourAngle = ((jHour % 12) + jMinute / 60) * 30;
  const minuteAngle = jMinute * 6;

  return (
    <div className="relative w-full h-full overflow-hidden">
      <svg viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" className="w-full h-full block">
        <defs>
          <pattern id="modernOakFloor" width="80" height="36" patternUnits="userSpaceOnUse">
            <rect width="80" height="36" fill="#DFC3A2" />
            <rect y="18" width="80" height="18" fill="#D6B692" />
            <line x1="0" y1="18" x2="80" y2="18" stroke="#C5A27B" strokeWidth="1.2" />
            <line x1="0" y1="36" x2="80" y2="36" stroke="#C5A27B" strokeWidth="1.2" />
            <line x1="38" y1="0" x2="38" y2="18" stroke="#C5A27B" strokeWidth="1.2" />
            <line x1="68" y1="18" x2="68" y2="36" stroke="#C5A27B" strokeWidth="1.2" />
          </pattern>
          <pattern id="woodSlats" width="14" height="40" patternUnits="userSpaceOnUse">
            <rect width="14" height="40" fill="#443326" />
            <rect x="2" width="9" height="40" fill="#9C6F49" />
          </pattern>
          <pattern id="modernStoneFloor" width="80" height="80" patternUnits="userSpaceOnUse">
            <rect width="80" height="80" fill="#ECEAE4" />
            <path d="M 80 0 L 0 0 0 80" fill="none" stroke="#D6D3CD" strokeWidth="1.5" />
            <circle cx="22" cy="28" r="1.4" fill="#B8B2A6" />
            <circle cx="58" cy="60" r="1.6" fill="#9CA3AF" />
            <circle cx="64" cy="20" r="1.1" fill="#C4B59B" />
          </pattern>
          <pattern id="spaFlutedTile" width="18" height="40" patternUnits="userSpaceOnUse">
            <rect width="18" height="40" fill="#E6ECEB" />
            <line x1="18" y1="0" x2="18" y2="40" stroke="#CBD5D1" strokeWidth="1.5" />
          </pattern>
          <linearGradient id="carraraMarble" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="55%" stopColor="#F1F5F9" />
            <stop offset="100%" stopColor="#E2E8F0" />
          </linearGradient>
          <linearGradient id="jakartaWindowSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={sky.sky} />
            <stop offset="100%" stopColor={sky.skyLower} />
          </linearGradient>
          <pattern id="modernDeck" width="60" height="24" patternUnits="userSpaceOnUse">
            <rect width="60" height="24" fill="#B98354" />
            <line x1="0" y1="24" x2="60" y2="24" stroke="#7C512D" strokeWidth="2" />
          </pattern>
        </defs>

        {/* 1. MODERN LIVING ROOM */}
        {roomId === 'living' && (
          <g>
            <rect width="400" height="345" fill="#F5F2EC" />
            <rect x="0" y="95" width="146" height="250" fill="url(#woodSlats)" />
            <rect y="345" width="400" height="455" fill="url(#modernOakFloor)" />
            <rect y="341" width="400" height="5" fill="#292524" />

            {/* Jakarta Sky & Skyline Window */}
            <g>
              <rect x="266" y="108" width="122" height="234" fill="url(#jakartaWindowSky)" stroke="#1C1917" strokeWidth="6" />
              {phase === 'night' ? (
                <g>
                  <circle cx="352" cy="144" r="15" fill="#FEF08A" />
                  <circle cx="358" cy="140" r="12" fill={sky.sky} />
                  <circle cx="292" cy="134" r="1.8" fill="#FFFFFF" className="pet-twinkle" />
                  <circle cx="316" cy="156" r="1.5" fill="#FEF08A" className="pet-twinkle" />
                  <circle cx="286" cy="172" r="1.4" fill="#FFFFFF" />
                  <circle cx="364" cy="176" r="1.6" fill="#FFFFFF" className="pet-twinkle" />
                </g>
              ) : (
                <g>
                  <circle
                    cx={phase === 'morning' ? 298 : phase === 'sunset' ? 356 : 348}
                    cy={phase === 'morning' ? 156 : phase === 'sunset' ? 174 : 142}
                    r={phase === 'day' ? 18 : 21}
                    fill={sky.sunColor}
                    opacity="0.95"
                  />
                  {phase === 'day' && (
                    <g fill="#FFFFFF" opacity="0.82">
                      <ellipse cx="296" cy="152" rx="18" ry="8" />
                      <ellipse cx="308" cy="150" rx="14" ry="7" />
                    </g>
                  )}
                </g>
              )}

              {/* Jakarta Skyline Silhouette */}
              <rect x="276" y="236" width="22" height="102" fill={sky.building1} />
              <rect x="304" y="214" width="26" height="124" fill={sky.building2} />
              <rect x="336" y="248" width="20" height="90" fill={sky.building1} />
              <rect x="360" y="226" width="22" height="112" fill={sky.building2} />

              {/* Lit Apartment Windows at Night */}
              {phase === 'night' && (
                <g fill="#FDE047" opacity="0.85">
                  <rect x="282" y="250" width="4" height="5" />
                  <rect x="290" y="272" width="4" height="5" />
                  <rect x="310" y="232" width="5" height="6" />
                  <rect x="319" y="256" width="5" height="6" />
                  <rect x="310" y="284" width="5" height="6" />
                  <rect x="342" y="268" width="4" height="5" />
                  <rect x="366" y="244" width="5" height="6" />
                  <rect x="373" y="276" width="5" height="6" />
                </g>
              )}

              <line x1="327" y1="108" x2="327" y2="342" stroke="#1C1917" strokeWidth="4.5" />
              <line x1="266" y1="186" x2="388" y2="186" stroke="#1C1917" strokeWidth="4" />
              <line x1="266" y1="264" x2="388" y2="264" stroke="#1C1917" strokeWidth="4" />

              {/* Sunlight Beam Slant on Floor during Morning & Day */}
              {(phase === 'morning' || phase === 'day') && (
                <polygon
                  points="266,345 388,345 330,455 210,455"
                  fill={phase === 'morning' ? '#FEF08A' : '#FFFFFF'}
                  opacity={phase === 'morning' ? '0.26' : '0.18'}
                  pointerEvents="none"
                />
              )}
            </g>

            <g
              onClick={(e) => {
                e.stopPropagation();
                onBoardClick?.();
              }}
              className="cursor-pointer"
            >
              <rect x="158" y="132" width="96" height="112" rx="4" fill="#FFFFFF" stroke="#1C1917" strokeWidth="3.5" />
              <rect x="168" y="142" width="76" height="92" fill="#FAF7F2" stroke="#E7E5E4" strokeWidth="1.5" />
              <text x="206" y="164" textAnchor="middle" fontSize="10" fontWeight="800" fill="#44403C" letterSpacing="1">
                OUR HOME 🏆
              </text>
              <text x="206" y="198" textAnchor="middle" fontSize="15" fontWeight="800" fill="#3B2618">
                R 🤍 U
              </text>
              <line x1="184" y1="216" x2="228" y2="216" stroke="#A8A29E" strokeWidth="2" />
            </g>

            <g>
              <rect x="10" y="168" width="126" height="177" fill="#57534E" stroke="#292524" strokeWidth="2.5" />
              <rect x="6" y="246" width="134" height="10" rx="2" fill="#D6B48C" stroke="#292524" strokeWidth="2" />
              <rect x="20" y="274" width="106" height="44" rx="4" fill="#1C1917" stroke="#292524" strokeWidth="2.5" />
              <ellipse cx="64" cy="302" rx="44" ry="18" fill="#FB923C" className="fire-glow" />
              <rect x="30" y="308" width="86" height="5" rx="2.5" fill="#78350F" />
              <ellipse cx="73" cy="311" rx="34" ry="3" fill="#EF4444" opacity="0.9" />
              <path
                d="M 38 310 C 36 296 45 288 49 282 C 53 289 58 279 62 275 C 67 284 74 288 78 281 C 83 289 90 284 95 280 C 101 289 106 298 102 310 Z"
                fill="#EA580C"
                className="fire-outer"
                style={{ transformOrigin: '70px 310px' }}
              />
              <path
                d="M 44 310 C 43 299 50 291 55 286 C 60 292 65 283 70 280 C 76 287 82 291 87 285 C 92 293 97 300 94 310 Z"
                fill="#F97316"
                className="fire-mid"
                style={{ transformOrigin: '70px 310px' }}
              />
              <path
                d="M 50 310 C 50 302 56 295 62 290 C 68 295 74 291 79 289 C 84 295 88 302 86 310 Z"
                fill="#FACC15"
                className="fire-core"
                style={{ transformOrigin: '70px 310px' }}
              />
              <circle cx="52" cy="292" r="1.5" fill="#FDE047" className="fire-spark-1" />
              <circle cx="74" cy="290" r="1.4" fill="#FB923C" className="fire-spark-2" />
              <circle cx="90" cy="293" r="1.3" fill="#FEF08A" className="fire-spark-3" />
              <path d="M 104 246 L 108 224 L 116 224 L 120 246 Z" fill="#F5F5F4" stroke="#292524" strokeWidth="2" />
              <path d="M 112 224 Q 106 210 100 206 M 112 224 Q 118 208 124 204" stroke="#4D7C0F" strokeWidth="2.2" fill="none" />
            </g>

            <rect x="44" y="384" width="268" height="196" rx="18" fill="#FAF8F5" stroke="#D6CFC2" strokeWidth="2.5" />
            <rect x="54" y="394" width="248" height="176" rx="12" fill="none" stroke="#E7E2D8" strokeWidth="1.5" strokeDasharray="6 4" />

            <g
              onClick={(e) => {
                e.stopPropagation();
                onSofaClick?.();
              }}
              className="cursor-pointer"
            >
              <line x1="68" y1="422" x2="68" y2="434" stroke="#1C1917" strokeWidth="4" />
              <line x1="252" y1="422" x2="252" y2="434" stroke="#1C1917" strokeWidth="4" />
              <rect x="56" y="336" width="208" height="54" rx="14" fill="#475569" stroke="#1E293B" strokeWidth="3" />
              <rect x="46" y="366" width="24" height="56" rx="10" fill="#334155" stroke="#1E293B" strokeWidth="3" />
              <rect x="250" y="366" width="24" height="56" rx="10" fill="#334155" stroke="#1E293B" strokeWidth="3" />
              <rect x="68" y="376" width="92" height="46" rx="10" fill="#64748B" stroke="#1E293B" strokeWidth="2.8" />
              <rect x="160" y="376" width="92" height="46" rx="10" fill="#64748B" stroke="#1E293B" strokeWidth="2.8" />
              <rect x="74" y="352" width="28" height="26" rx="6" fill="#D97757" stroke="#7C2D12" strokeWidth="2" transform="rotate(-8 88 365)" />
              <g style={hintStyle}>
                <rect x="106" y="388" width="108" height="22" rx="11" fill="#FFFFFF" fillOpacity="0.94" stroke="#1E293B" strokeWidth="1.5" />
                <text x="160" y="403" textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#1E293B">
                  🎮 Tap Sofa to Play!
                </text>
              </g>
            </g>

            <g>
              <ellipse cx="322" cy="432" rx="16" ry="6" fill="#1C1917" />
              <path d="M 322 432 Q 324 345 278 338" fill="none" stroke="#1C1917" strokeWidth="3.5" />
              <path d="M 264 344 Q 278 326 292 344 Z" fill="#FBBF24" stroke="#1C1917" strokeWidth="2.5" />

              <g
                onClick={(e) => {
                  e.stopPropagation();
                  onWardrobeClick?.();
                }}
                className="cursor-pointer"
              >
                <path
                  d="M 288 650 L 288 564 A 24 24 0 0 1 336 564 L 336 650 Z"
                  fill="#E0F2FE"
                  stroke="#1C1917"
                  strokeWidth="4.5"
                />
                <line x1="296" y1="576" x2="322" y2="554" stroke="#FFFFFF" strokeWidth="3.5" opacity="0.85" />
                <line x1="302" y1="590" x2="328" y2="568" stroke="#FFFFFF" strokeWidth="2" opacity="0.65" />
                <g style={hintStyle}>
                  <rect x="272" y="655" width="80" height="20" rx="10" fill="#1C1917" />
                  <text x="312" y="669" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#FFFFFF">
                    🪞 Dress Up!
                  </text>
                </g>
              </g>
            </g>
          </g>
        )}

        {/* 2. MODERN DINING & KITCHEN */}
        {roomId === 'dining' && (
          <g>
            <rect width="400" height="325" fill="#F4F1EA" />
            <rect x="108" y="182" width="288" height="143" fill="url(#carraraMarble)" stroke="#E2E8F0" strokeWidth="1.5" />
            <rect y="325" width="400" height="475" fill="url(#modernStoneFloor)" />

            <g>
              <rect x="8" y="168" width="94" height="178" rx="8" fill="#334155" stroke="#0F172A" strokeWidth="3" />
              <line x1="55" y1="168" x2="55" y2="288" stroke="#0F172A" strokeWidth="2.5" />
              <line x1="8" y1="288" x2="102" y2="288" stroke="#0F172A" strokeWidth="3" />
              <rect x="47" y="210" width="3.5" height="46" rx="1.5" fill="#94A3B8" />
              <rect x="60" y="210" width="3.5" height="46" rx="1.5" fill="#94A3B8" />
              <rect x="68" y="214" width="22" height="32" rx="3" fill="#0F172A" stroke="#475569" strokeWidth="1.5" />
              <circle cx="79" cy="226" r="4" fill="#38BDF8" opacity="0.8" />
            </g>

            <g
              onClick={(e) => {
                e.stopPropagation();
                onStoveClick?.();
              }}
              className="cursor-pointer"
            >
              <rect x="164" y="100" width="28" height="48" fill="#27272A" />
              <polygon points="134,164 222,164 206,146 150,146" fill="#18181B" stroke="#09090B" strokeWidth="2" />
              <rect x="114" y="246" width="128" height="100" rx="6" fill="#C89F74" stroke="#443326" strokeWidth="2.8" />
              <rect x="112" y="242" width="132" height="10" rx="3" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="2" />
              <rect x="132" y="268" width="92" height="62" rx="6" fill="#18181B" stroke="#52525B" strokeWidth="2.5" />
              <rect x="142" y="284" width="72" height="34" rx="4" fill="#27272A" />
              <line x1="142" y1="276" x2="214" y2="276" stroke="#E4E4E7" strokeWidth="3" strokeLinecap="round" />
              <ellipse cx="178" cy="240" rx="24" ry="8" fill="#1E293B" stroke="#0F172A" strokeWidth="2" />
              <line x1="202" y1="240" x2="224" y2="236" stroke="#B45309" strokeWidth="3.5" strokeLinecap="round" />
              <g style={hintStyle}>
                <rect x="122" y="184" width="112" height="22" rx="11" fill="#18181B" />
                <text x="178" y="199" textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#FFFFFF">
                  🍳 Tap to Cook!
                </text>
              </g>
            </g>

            <g>
              <rect x="252" y="246" width="140" height="100" rx="6" fill="#C89F74" stroke="#443326" strokeWidth="2.8" />
              <rect x="250" y="242" width="144" height="10" rx="3" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="2" />
              <path d="M 326 242 L 326 216 A 10 10 0 0 1 346 216 L 346 226" fill="none" stroke="#18181B" strokeWidth="3.5" strokeLinecap="round" />
              <rect x="266" y="214" width="32" height="28" rx="4" fill="#E4E4E7" stroke="#3F3F46" strokeWidth="2" />
              <circle cx="282" cy="224" r="4" fill="#18181B" />
            </g>

            <g stroke="#292524" strokeWidth="2.8" strokeLinejoin="round">
              <path d="M 68 468 L 74 402 Q 92 394 110 402 L 114 468" fill="none" stroke="#B98354" strokeWidth="5" />
              <rect x="68" y="436" width="46" height="10" rx="4" fill="#D6B48C" />
              <path d="M 286 468 L 290 402 Q 308 394 326 402 L 332 468" fill="none" stroke="#B98354" strokeWidth="5" />
              <rect x="286" y="436" width="46" height="10" rx="4" fill="#D6B48C" />
            </g>

            <g
              onClick={(e) => {
                e.stopPropagation();
                onTableClick?.();
              }}
              className="cursor-pointer"
            >
              <ellipse cx="200" cy="542" rx="44" ry="12" fill="#E2E8F0" stroke="#475569" strokeWidth="2.5" />
              <path d="M 188 476 Q 192 512 174 540 L 226 540 Q 208 512 212 476 Z" fill="#F8FAFC" stroke="#475569" strokeWidth="2.5" />
              <ellipse cx="200" cy="454" rx="102" ry="36" fill="url(#carraraMarble)" stroke="#334155" strokeWidth="3" />
              <path d="M 100 456 Q 200 492 300 456 L 300 464 Q 200 500 100 464 Z" fill="#CBD5E1" stroke="#334155" strokeWidth="2.5" />
              <ellipse cx="200" cy="452" rx="34" ry="14" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="2" />
              <g style={hintStyle}>
                <rect x="142" y="492" width="116" height="22" rx="11" fill="#1E293B" />
                <text x="200" y="507" textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#FFFFFF">
                  🍽️ Tap Table for Food!
                </text>
              </g>
            </g>
          </g>
        )}

        {/* 3. MODERN SPA BATHROOM */}
        {roomId === 'bathroom' && (
          <g>
            <rect width="400" height="335" fill="url(#spaFlutedTile)" />
            <rect y="335" width="400" height="465" fill="url(#modernStoneFloor)" />

            <g
              onClick={(e) => {
                e.stopPropagation();
                onToiletClick?.();
              }}
              className="cursor-pointer"
            >
              <rect x="40" y="214" width="40" height="26" rx="4" fill="#FFFFFF" stroke="#334155" strokeWidth="2" />
              <rect x="47" y="220" width="11" height="14" rx="2" fill="#E2E8F0" stroke="#64748B" strokeWidth="1.5" />
              <rect x="62" y="220" width="11" height="14" rx="2" fill="#E2E8F0" stroke="#64748B" strokeWidth="1.5" />
              <ellipse cx="60" cy="364" rx="32" ry="8" fill="#CBD5E1" opacity="0.6" />
              <ellipse cx="60" cy="272" rx="30" ry="26" fill="#FFFFFF" stroke="#1E293B" strokeWidth="3" />
              <ellipse cx="60" cy="274" rx="21" ry="18" fill="#F1F5F9" />
              <path
                d="M 24 302 Q 24 342 60 342 Q 96 342 96 302 Z"
                fill="#FFFFFF"
                stroke="#1E293B"
                strokeWidth="3"
              />
              <ellipse cx="60" cy="304" rx="36" ry="18" fill="#FFFFFF" stroke="#1E293B" strokeWidth="3" />
              <ellipse cx="60" cy="305" rx="25" ry="11" fill="#E0F2FE" stroke="#7DD3FC" strokeWidth="1.8" />
              <ellipse cx="60" cy="308" rx="16" ry="6.5" fill="#38BDF8" />
              <line x1="106" y1="274" x2="128" y2="274" stroke="#18181B" strokeWidth="3.5" strokeLinecap="round" />
              <rect x="108" y="276" width="18" height="20" rx="3" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="2" />
              <g style={hintStyle}>
                <rect x="18" y="368" width="84" height="22" rx="11" fill="#1E293B" />
                <text x="60" y="383" textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#FFFFFF">
                  🚽 Poop Time
                </text>
              </g>
            </g>

            <g>
              <rect x="162" y="144" width="78" height="104" rx="39" fill="#FEF08A" opacity="0.7" />
              <rect x="167" y="149" width="68" height="94" rx="34" fill="#F0F9FF" stroke="#1E293B" strokeWidth="3" />
              <line x1="180" y1="176" x2="216" y2="160" stroke="#FFFFFF" strokeWidth="3" opacity="0.85" />
              <rect x="142" y="272" width="118" height="58" rx="6" fill="#C89F74" stroke="#443326" strokeWidth="2.8" />
              <line x1="142" y1="301" x2="260" y2="301" stroke="#443326" strokeWidth="2" />
              <rect x="174" y="254" width="54" height="18" rx="6" fill="#FFFFFF" stroke="#1E293B" strokeWidth="2.5" />
              <path d="M 201 254 L 201 242 L 210 242" fill="none" stroke="#18181B" strokeWidth="3.5" strokeLinecap="round" />
            </g>

            <g>
              <rect x="284" y="206" width="108" height="140" rx="10" fill="#F8FAFC" stroke="#334155" strokeWidth="3" />
              <rect x="294" y="216" width="88" height="16" rx="4" fill="#1E293B" />
              <circle cx="366" cy="224" r="3" fill="#38BDF8" />
              <circle cx="338" cy="292" r="35" fill="#1E293B" stroke="#64748B" strokeWidth="3" />
              <circle cx="338" cy="292" r="25" fill="#BAE6FD" opacity="0.85" />
            </g>

            <g
              onClick={(e) => {
                e.stopPropagation();
                onTubClick?.();
              }}
              className="cursor-pointer"
            >
              <path d="M 372 520 L 372 456 Q 372 444 358 444 L 352 452" fill="none" stroke="#18181B" strokeWidth="4.5" strokeLinecap="round" />
              <rect x="190" y="504" width="196" height="106" rx="42" fill="#FFFFFF" stroke="#1E293B" strokeWidth="3.5" />
              <ellipse cx="288" cy="516" rx="88" ry="20" fill="#E0F2FE" stroke="#38BDF8" strokeWidth="2" />
              <ellipse cx="288" cy="518" rx="76" ry="14" fill="#7DD3FC" />
              <text x="234" y="514" fontSize="24">🐥</text>
              <g style={hintStyle}>
                <rect x="216" y="556" width="144" height="24" rx="12" fill="#1E293B" />
                <text x="288" y="572" textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#FFFFFF">
                  🧽 Tap Tub for Bath!
                </text>
              </g>
            </g>
          </g>
        )}

        {/* 4. MODERN PLATFORM BEDROOM (LIVE JAKARTA SKY WINDOW & WALL CLOCK) */}
        {roomId === 'bedroom' && (
          <g>
            <rect width="400" height="330" fill="#EDEAE4" />
            <rect x="10" y="218" width="242" height="112" rx="6" fill="url(#woodSlats)" />
            <rect y="330" width="400" height="470" fill="url(#modernOakFloor)" />
            <rect y="326" width="400" height="5" fill="#292524" />

            {/* Bedroom Window synced to Jakarta time */}
            <g>
              <rect x="36" y="138" width="92" height="68" rx="4" fill="url(#jakartaWindowSky)" stroke="#1C1917" strokeWidth="4.5" />
              {phase === 'night' ? (
                <g>
                  <text x="60" y="178" textAnchor="middle" fontSize="18">🌙</text>
                  <text x="104" y="176" textAnchor="middle" fontSize="16">✨</text>
                </g>
              ) : (
                <g>
                  <circle cx="66" cy="166" r="13" fill={sky.sunColor} />
                  {phase === 'day' && <ellipse cx="102" cy="176" rx="14" ry="6" fill="#FFFFFF" opacity="0.85" />}
                </g>
              )}
              <line x1="82" y1="138" x2="82" y2="206" stroke="#1C1917" strokeWidth="3.5" />
            </g>

            {/* Live Jakarta Wall Clock */}
            <g>
              <circle cx="316" cy="184" r="28" fill="#FFFFFF" stroke="#1C1917" strokeWidth="3.5" />
              <line
                x1="316"
                y1="184"
                x2="316"
                y2="169"
                stroke="#1C1917"
                strokeWidth="3"
                strokeLinecap="round"
                transform={`rotate(${hourAngle} 316 184)`}
              />
              <line
                x1="316"
                y1="184"
                x2="316"
                y2="163"
                stroke="#D97757"
                strokeWidth="2.2"
                strokeLinecap="round"
                transform={`rotate(${minuteAngle} 316 184)`}
              />
              <circle cx="316" cy="184" r="3" fill="#1C1917" />
            </g>

            <g
              onClick={(e) => {
                e.stopPropagation();
                onLampClick?.();
              }}
              className="cursor-pointer"
            >
              <line x1="200" y1="0" x2="200" y2="178" stroke="#1C1917" strokeWidth="3.5" />
              {!isSleeping && <circle cx="200" cy="208" r="50" fill="#FEF08A" opacity="0.45" />}
              <path d="M 156 206 Q 200 162 244 206 Z" fill={isSleeping ? '#52525B' : '#18181B'} stroke="#09090B" strokeWidth="3" />
              <ellipse cx="200" cy="206" rx="42" ry="6" fill={isSleeping ? '#71717A' : '#FDE047'} />
              <g style={hintStyle}>
                <rect x="130" y="220" width="140" height="22" rx="11" fill="#18181B" fillOpacity="0.92" />
                <text x="200" y="235" textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#FFFFFF">
                  {isSleeping ? '☀️ Tap Lamp to Wake' : isPetOnBed ? '💡 Tap Lamp to Sleep!' : '💡 Pendant Lamp'}
                </text>
              </g>
            </g>

            {[0, 1].map((bedIdx) => {
              const bx = bedIdx === 0 ? 16 : 136;
              return (
                <g
                  key={bedIdx}
                  onClick={(e) => {
                    e.stopPropagation();
                    onBedClick?.(bedIdx);
                  }}
                  className="cursor-pointer"
                >
                  <rect x={bx} y="296" width="110" height="122" rx="8" fill="#C89F74" stroke="#443326" strokeWidth="3" />
                  <rect x={bx + 14} y="308" width="82" height="30" rx="8" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="2.2" />
                  <rect x={bx + 6} y="338" width="98" height="68" rx="8" fill="#F8FAFC" stroke="#94A3B8" strokeWidth="2.2" />
                  <rect x={bx + 6} y="378" width="98" height="28" rx="6" fill="#64748B" />
                </g>
              );
            })}

            <g
              onClick={(e) => {
                e.stopPropagation();
                onWardrobeClick?.();
              }}
              className="cursor-pointer"
            >
              <rect x="284" y="508" width="110" height="146" rx="8" fill="#27272A" stroke="#09090B" strokeWidth="3.5" />
              <rect x="292" y="516" width="44" height="130" rx="4" fill="#FEF3C7" opacity="0.88" />
              <rect x="342" y="516" width="44" height="130" rx="4" fill="#E0F2FE" opacity="0.82" />
              <line x1="296" y1="534" x2="332" y2="534" stroke="#78350F" strokeWidth="2.5" />
              <path d="M 304 534 L 298 564 L 318 564 L 312 534 Z" fill="#FB7185" />
              <path d="M 320 534 L 315 568 L 330 568 L 326 534 Z" fill="#38BDF8" />
              <g style={hintStyle}>
                <rect x="290" y="482" width="98" height="22" rx="11" fill="#18181B" />
                <text x="339" y="497" textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#FFFFFF">
                  👗 Wardrobe!
                </text>
              </g>
            </g>
          </g>
        )}

        {/* 5. MODERN COURTYARD & ROOFTOP PARK (LIVE JAKARTA SKY) */}
        {roomId === 'park' && (
          <g>
            <rect width="400" height="335" fill="url(#jakartaWindowSky)" />
            {phase === 'night' ? (
              <g>
                <circle cx="326" cy="144" r="26" fill="#FEF08A" />
                <circle cx="336" cy="136" r="22" fill={sky.sky} />
                <circle cx="88" cy="128" r="2.5" fill="#FFFFFF" className="pet-twinkle" />
                <circle cx="152" cy="112" r="2" fill="#FEF08A" className="pet-twinkle" />
                <circle cx="222" cy="138" r="2.5" fill="#FFFFFF" className="pet-twinkle" />
                <circle cx="272" cy="108" r="2" fill="#FFFFFF" />
              </g>
            ) : (
              <g>
                <circle
                  cx={phase === 'morning' ? 110 : phase === 'sunset' ? 334 : 326}
                  cy={phase === 'morning' ? 168 : phase === 'sunset' ? 198 : 144}
                  r={phase === 'day' ? 32 : 36}
                  fill={sky.sunColor}
                />
                <ellipse cx="94" cy="146" rx="46" ry="18" fill="#FFFFFF" opacity={phase === 'sunset' ? '0.55' : '0.88'} />
                <ellipse cx="222" cy="126" rx="52" ry="20" fill="#FFFFFF" opacity={phase === 'sunset' ? '0.55' : '0.88'} />
              </g>
            )}

            <rect y="302" width="400" height="34" fill="#E7E5E4" stroke="#78716C" strokeWidth="2.5" />
            <rect y="274" width="400" height="28" fill="#BAE6FD" fillOpacity="0.45" stroke="#334155" strokeWidth="2" />

            <rect y="336" width="400" height="464" fill={phase === 'night' ? '#4D7C0F' : '#A3D977'} />
            <rect x="18" y="352" width="168" height="132" rx="12" fill="url(#modernDeck)" stroke="#78350F" strokeWidth="2.5" />
            <rect x="172" y="512" width="64" height="26" rx="6" fill="#F5F5F4" stroke="#A8A29E" strokeWidth="2" />
            <rect x="186" y="556" width="64" height="26" rx="6" fill="#F5F5F4" stroke="#A8A29E" strokeWidth="2" />
            <rect x="168" y="600" width="64" height="26" rx="6" fill="#F5F5F4" stroke="#A8A29E" strokeWidth="2" />
            <rect x="184" y="644" width="64" height="26" rx="6" fill="#F5F5F4" stroke="#A8A29E" strokeWidth="2" />

            <g>
              <rect x="34" y="346" width="54" height="28" rx="6" fill="#57534E" stroke="#292524" strokeWidth="2.5" />
              <rect x="52" y="246" width="18" height="100" rx="6" fill="#78350F" />
              <circle cx="62" cy="204" r="64" fill={phase === 'night' ? '#3F6212' : '#84CC16'} />
              <circle cx="108" cy="232" r="42" fill={phase === 'night' ? '#4D7C0F' : '#A3E635'} />
              <circle cx="24" cy="232" r="42" fill={phase === 'night' ? '#365314' : '#65A30D'} />
            </g>

            <g
              onClick={(e) => {
                e.stopPropagation();
                onParkPlayClick?.();
              }}
              className="cursor-pointer"
            >
              <rect x="44" y="392" width="116" height="24" rx="4" fill="#C89F74" stroke="#292524" strokeWidth="2.5" />
              <rect x="38" y="422" width="128" height="14" rx="4" fill="#B98354" stroke="#292524" strokeWidth="2.5" />
              <line x1="48" y1="436" x2="48" y2="450" stroke="#18181B" strokeWidth="4" />
              <line x1="156" y1="436" x2="156" y2="450" stroke="#18181B" strokeWidth="4" />
              <g style={hintStyle}>
                <rect x="46" y="454" width="112" height="22" rx="11" fill="#18181B" />
                <text x="102" y="469" textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#FFFFFF">
                  🎾 Tap to Fetch!
                </text>
              </g>
            </g>

            <g>
              <rect x="236" y="544" width="146" height="92" rx="14" fill={phase === 'night' ? '#0284C7' : '#7DD3FC'} stroke="#44403C" strokeWidth="5" />
              <rect x="244" y="552" width="130" height="76" rx="8" fill="none" stroke="#BAE6FD" strokeWidth="2" />
              <ellipse cx="288" cy="590" rx="20" ry="11" fill="#4ADE80" />
              <text x="278" y="594" fontSize="20">🪷</text>
            </g>
          </g>
        )}

        {/* Ambient Jakarta Time-of-Day Tint (Sunset warmth / Night dim) */}
        {sky.ambientOpacity > 0 && (
          <rect width="400" height="800" fill={sky.ambientTint} opacity={sky.ambientOpacity} pointerEvents="none" />
        )}

        {/* Bedroom Lamp Off Dim Overlay */}
        {isSleeping && <rect width="400" height="800" fill="#0F172A" opacity="0.46" pointerEvents="none" />}
      </svg>
    </div>
  );
}

// ============================================================================
// SPECIES-SPECIFIC OUTFIT ANCHOR CALIBRATION (PERFECT FIT FOR ALL 16 PETS)
// ============================================================================
const PET_OUTFIT_ANCHORS = {
  orange_cat:      { headX: 58, headY: 26, headScale: 1.0,  bodyX: 58, bodyY: 82, bodyScaleX: 1.0,  bodyScaleY: 1.0,  visorY: 48, visorR: 32 },
  shiba_inu:       { headX: 58, headY: 28, headScale: 1.02, bodyX: 58, bodyY: 84, bodyScaleX: 1.0,  bodyScaleY: 0.96, visorY: 50, visorR: 32 },
  carrot_bunny:    { headX: 58, headY: 32, headScale: 0.94, bodyX: 58, bodyY: 84, bodyScaleX: 0.96, bodyScaleY: 0.96, visorY: 54, visorR: 30 },
  golden_hamster:  { headX: 60, headY: 34, headScale: 1.08, bodyX: 60, bodyY: 82, bodyScaleX: 1.18, bodyScaleY: 1.05, visorY: 58, visorR: 36 },
  blue_macaw:      { headX: 58, headY: 30, headScale: 0.88, bodyX: 58, bodyY: 74, bodyScaleX: 0.92, bodyScaleY: 1.05, visorY: 48, visorR: 28 },
  meadow_turtle:   { headX: 34, headY: 50, headScale: 0.78, bodyX: 66, bodyY: 76, bodyScaleX: 1.08, bodyScaleY: 0.86, visorY: 66, visorR: 24 },
  fluffy_bluebird: { headX: 60, headY: 36, headScale: 1.02, bodyX: 60, bodyY: 76, bodyScaleX: 1.04, bodyScaleY: 0.92, visorY: 60, visorR: 32 },
  coral_chameleon: { headX: 42, headY: 44, headScale: 0.74, bodyX: 62, bodyY: 74, bodyScaleX: 0.95, bodyScaleY: 0.82, visorY: 58, visorR: 22 },
  baby_dragon:     { headX: 58, headY: 28, headScale: 0.96, bodyX: 58, bodyY: 82, bodyScaleX: 0.96, bodyScaleY: 1.0,  visorY: 50, visorR: 30 },
  cosmic_star:     { headX: 60, headY: 24, headScale: 0.95, bodyX: 60, bodyY: 78, bodyScaleX: 1.05, bodyScaleY: 0.92, visorY: 58, visorR: 34 },
  mini_griffin:    { headX: 56, headY: 28, headScale: 0.96, bodyX: 58, bodyY: 82, bodyScaleX: 0.98, bodyScaleY: 0.96, visorY: 50, visorR: 30 },
  rainbow_unicorn: { headX: 56, headY: 29, headScale: 0.94, bodyX: 60, bodyY: 82, bodyScaleX: 1.0,  bodyScaleY: 0.96, visorY: 50, visorR: 30 },
  fancy_goldfish:  { headX: 56, headY: 40, headScale: 1.02, bodyX: 56, bodyY: 74, bodyScaleX: 1.08, bodyScaleY: 0.88, visorY: 62, visorR: 32 },
  woodland_owl:    { headX: 60, headY: 36, headScale: 1.02, bodyX: 60, bodyY: 78, bodyScaleX: 1.04, bodyScaleY: 1.02, visorY: 60, visorR: 33 },
  lilypad_frog:    { headX: 60, headY: 42, headScale: 1.06, bodyX: 60, bodyY: 78, bodyScaleX: 1.12, bodyScaleY: 0.92, visorY: 62, visorR: 33 },
  space_hamster:   { headX: 60, headY: 24, headScale: 0.96, bodyX: 60, bodyY: 84, bodyScaleX: 1.0,  bodyScaleY: 1.0,  visorY: 48, visorR: 32 },
};

// ============================================================================
// PET OUTFIT SVG OVERLAY LAYER (HATS, SHIRTS & FULL COSTUMES)
// ============================================================================
function PetOutfitLayer({ outfit, speciesId = 'orange_cat' }) {
  if (!outfit) return null;
  const { hat, shirt, costume } = outfit;
  const a = PET_OUTFIT_ANCHORS[speciesId] || PET_OUTFIT_ANCHORS.orange_cat;

  const headTransform = `translate(${a.headX}, ${a.headY}) scale(${a.headScale}) translate(-60, -26)`;
  const bodyTransform = `translate(${a.bodyX}, ${a.bodyY}) scale(${a.bodyScaleX}, ${a.bodyScaleY}) translate(-60, -82)`;

  return (
    <g pointerEvents="none" strokeLinecap="round" strokeLinejoin="round">
      {costume === 'costume_bee' && (
        <g>
          <g transform={bodyTransform}>
            <ellipse cx="32" cy="64" rx="13" ry="8" fill="#E0F2FE" stroke="#38BDF8" strokeWidth="2" transform="rotate(-24 32 64)" />
            <ellipse cx="88" cy="64" rx="13" ry="8" fill="#E0F2FE" stroke="#38BDF8" strokeWidth="2" transform="rotate(24 88 64)" />
            <path d="M 34 74 Q 60 82 86 74 L 84 94 Q 60 102 36 94 Z" fill="#FACC15" stroke="#422006" strokeWidth="2.4" />
            <path d="M 35 81 Q 60 88 85 81" fill="none" stroke="#422006" strokeWidth="4" />
            <path d="M 36 89 Q 60 95 84 89" fill="none" stroke="#422006" strokeWidth="4" />
          </g>
          <g transform={headTransform}>
            <path d="M 52 24 Q 44 10 38 14" fill="none" stroke="#422006" strokeWidth="2.5" />
            <circle cx="38" cy="14" r="3.5" fill="#FACC15" stroke="#422006" strokeWidth="2" />
            <path d="M 68 24 Q 76 10 82 14" fill="none" stroke="#422006" strokeWidth="2.5" />
            <circle cx="82" cy="14" r="3.5" fill="#FACC15" stroke="#422006" strokeWidth="2" />
          </g>
        </g>
      )}
      {costume === 'costume_dino' && (
        <g>
          <g transform={bodyTransform}>
            <path d="M 34 72 Q 60 80 86 72 L 85 96 Q 60 104 35 96 Z" fill="#4ADE80" stroke="#14532D" strokeWidth="2.4" />
            <ellipse cx="60" cy="86" rx="14" ry="11" fill="#FEF08A" />
            <polygon points="84,68 96,74 85,80" fill="#F97316" stroke="#14532D" strokeWidth="2" />
            <polygon points="85,80 98,86 84,92" fill="#F97316" stroke="#14532D" strokeWidth="2" />
          </g>
          <g transform={headTransform}>
            <polygon points="54,25 60,11 66,25" fill="#F97316" stroke="#14532D" strokeWidth="2" />
          </g>
        </g>
      )}
      {costume === 'costume_astro' && (
        <g>
          <g transform={bodyTransform}>
            <rect x="33" y="72" width="54" height="28" rx="14" fill="#F8FAFC" stroke="#334155" strokeWidth="2.4" />
            <rect x="48" y="79" width="24" height="12" rx="4" fill="#38BDF8" stroke="#0369A1" strokeWidth="1.8" />
          </g>
          <g transform={`translate(${a.headX}, ${a.visorY}) scale(${a.visorR / 32}) translate(-60, -48)`}>
            <circle cx="60" cy="48" r="32" fill="#BAE6FD" fillOpacity="0.25" stroke="#38BDF8" strokeWidth="3.2" />
            <path d="M 39 33 Q 48 22 63 22" fill="none" stroke="#FFFFFF" strokeWidth="3" opacity="0.9" />
          </g>
        </g>
      )}
      {costume === 'costume_strawberry' && (
        <g>
          <g transform={bodyTransform}>
            <path d="M 33 70 Q 60 76 87 70 Q 88 98 60 103 Q 32 98 33 70 Z" fill="#FB7185" stroke="#9F1239" strokeWidth="2.4" />
            <circle cx="48" cy="82" r="1.8" fill="#FEF08A" />
            <circle cx="60" cy="86" r="1.8" fill="#FEF08A" />
            <circle cx="72" cy="82" r="1.8" fill="#FEF08A" />
            <circle cx="54" cy="94" r="1.8" fill="#FEF08A" />
            <circle cx="66" cy="94" r="1.8" fill="#FEF08A" />
          </g>
          <g transform={headTransform}>
            <path d="M 42 26 L 52 32 L 60 23 L 68 32 L 78 26 L 70 18 L 50 18 Z" fill="#22C55E" stroke="#14532D" strokeWidth="2" />
          </g>
        </g>
      )}
      {costume === 'costume_ghost' && (
        <g transform={bodyTransform}>
          <path
            d="M 30 62 Q 30 22 60 22 Q 90 22 90 62 L 92 98 Q 84 92 76 98 Q 68 92 60 98 Q 52 92 44 98 Q 36 92 28 98 Z"
            fill="#FFFFFF"
            fillOpacity="0.86"
            stroke="#94A3B8"
            strokeWidth="2.4"
          />
          <circle cx="49" cy="50" r="4" fill="#334155" />
          <circle cx="71" cy="50" r="4" fill="#334155" />
          <ellipse cx="60" cy="58" rx="4" ry="5" fill="#334155" />
        </g>
      )}
      {costume === 'costume_panda' && (
        <g>
          <g transform={headTransform}>
            <circle cx="40" cy="24" r="8.5" fill="#1E293B" stroke="#0F172A" strokeWidth="2.2" />
            <circle cx="80" cy="24" r="8.5" fill="#1E293B" stroke="#0F172A" strokeWidth="2.2" />
          </g>
          <g transform={bodyTransform}>
            <path d="M 34 72 Q 60 80 86 72 L 85 96 Q 60 103 35 96 Z" fill="#FFFFFF" stroke="#1E293B" strokeWidth="2.5" />
            <path d="M 34 72 Q 60 80 86 72 L 85 82 Q 60 89 35 82 Z" fill="#1E293B" />
          </g>
        </g>
      )}

      {!costume && shirt && (
        <g transform={bodyTransform}>
          {shirt === 'shirt_bow' && (
            <g stroke="#881337" strokeWidth="2">
              <polygon points="60,73 46,66 46,80" fill="#FB7185" />
              <polygon points="60,73 74,66 74,80" fill="#FB7185" />
              <circle cx="60" cy="73" r="4.5" fill="#FFE4E6" />
            </g>
          )}
          {shirt === 'shirt_scarf' && (
            <g stroke="#7C2D12" strokeWidth="2.2">
              <rect x="38" y="67" width="44" height="11" rx="5.5" fill="#F97316" />
              <rect x="64" y="75" width="11" height="18" rx="4" fill="#FB923C" />
              <line x1="48" y1="67" x2="48" y2="78" stroke="#FEF08A" strokeWidth="2.5" />
              <line x1="58" y1="67" x2="58" y2="78" stroke="#FEF08A" strokeWidth="2.5" />
            </g>
          )}
          {shirt === 'shirt_sailor' && (
            <g stroke="#1E3A8A" strokeWidth="2.2">
              <path d="M 35 72 Q 60 80 85 72 L 83 94 Q 60 100 37 94 Z" fill="#FFFFFF" />
              <polygon points="38,72 60,86 82,72 74,68 60,78 46,68" fill="#2563EB" />
              <polygon points="60,84 54,94 66,94" fill="#EF4444" />
            </g>
          )}
          {shirt === 'shirt_overalls' && (
            <g stroke="#1E3A8A" strokeWidth="2.2">
              <rect x="37" y="78" width="46" height="19" rx="7" fill="#3B82F6" />
              <rect x="42" y="68" width="7" height="12" rx="3" fill="#3B82F6" />
              <rect x="71" y="68" width="7" height="12" rx="3" fill="#3B82F6" />
              <circle cx="45.5" cy="79" r="2" fill="#FACC15" stroke="none" />
              <circle cx="74.5" cy="79" r="2" fill="#FACC15" stroke="none" />
              <rect x="52" y="83" width="16" height="9" rx="3" fill="#60A5FA" />
            </g>
          )}
          {shirt === 'shirt_hoodie' && (
            <g stroke="#9D174D" strokeWidth="2.2">
              <path d="M 34 71 Q 60 79 86 71 L 85 95 Q 60 102 35 95 Z" fill="#F472B6" />
              <rect x="48" y="83" width="24" height="10" rx="4" fill="#FBCFE8" />
              <line x1="54" y1="74" x2="54" y2="82" stroke="#FFFFFF" strokeWidth="2" />
              <line x1="66" y1="74" x2="66" y2="82" stroke="#FFFFFF" strokeWidth="2" />
            </g>
          )}
          {shirt === 'shirt_tux' && (
            <g stroke="#0F172A" strokeWidth="2.2">
              <path d="M 35 71 Q 60 79 85 71 L 84 95 Q 60 101 36 95 Z" fill="#1E293B" />
              <polygon points="50,72 60,91 70,72" fill="#FFFFFF" />
              <polygon points="60,74 52,70 52,78" fill="#EF4444" />
              <polygon points="60,74 68,70 68,78" fill="#EF4444" />
            </g>
          )}
          {shirt === 'shirt_flowers' && (
            <g>
              {[40, 48, 56, 64, 72, 80].map((fx, i) => (
                <g key={fx} transform={`translate(${fx}, ${72 + (i % 2) * 3})`}>
                  <circle r="5.5" fill="#FBCFE8" stroke="#DB2777" strokeWidth="1.5" />
                  <circle r="2" fill="#FACC15" />
                </g>
              ))}
            </g>
          )}
          {shirt === 'shirt_cape' && (
            <g stroke="#7F1D1D" strokeWidth="2.2">
              <path d="M 38 70 Q 20 84 26 98 L 94 98 Q 100 84 82 70 Z" fill="#EF4444" />
              <circle cx="60" cy="72" r="4.5" fill="#FACC15" />
            </g>
          )}
        </g>
      )}

      {hat && (
        <g transform={headTransform}>
          {hat === 'hat_crown' && (
            <g stroke="#78350F" strokeWidth="2.2">
              <polygon points="43,27 45,12 53,21 60,9 67,21 75,12 77,27" fill="#FACC15" />
              <circle cx="60" cy="21" r="2.3" fill="#EF4444" stroke="none" />
              <circle cx="50" cy="22" r="1.8" fill="#38BDF8" stroke="none" />
              <circle cx="70" cy="22" r="1.8" fill="#38BDF8" stroke="none" />
            </g>
          )}
          {hat === 'hat_party' && (
            <g stroke="#4C1D95" strokeWidth="2.2">
              <polygon points="48,27 60,5 72,27" fill="#A855F7" />
              <line x1="52" y1="19" x2="68" y2="19" stroke="#FACC15" strokeWidth="2.5" />
              <circle cx="60" cy="5" r="4" fill="#FB7185" />
            </g>
          )}
          {hat === 'hat_frog' && (
            <g stroke="#14532D" strokeWidth="2.2">
              <path d="M 40 28 Q 60 14 80 28 Z" fill="#4ADE80" />
              <circle cx="47" cy="18" r="6.5" fill="#4ADE80" />
              <circle cx="73" cy="18" r="6.5" fill="#4ADE80" />
              <circle cx="47" cy="18" r="3" fill="#FFFFFF" stroke="none" />
              <circle cx="73" cy="18" r="3" fill="#FFFFFF" stroke="none" />
              <circle cx="47" cy="18" r="1.5" fill="#0F172A" stroke="none" />
              <circle cx="73" cy="18" r="1.5" fill="#0F172A" stroke="none" />
            </g>
          )}
          {hat === 'hat_beret' && (
            <g stroke="#881337" strokeWidth="2.2">
              <ellipse cx="62" cy="22" rx="20" ry="9" fill="#F43F5E" transform="rotate(-10 62 22)" />
              <line x1="62" y1="13" x2="65" y2="8" stroke="#881337" strokeWidth="2.5" />
            </g>
          )}
          {hat === 'hat_sprout' && (
            <g stroke="#14532D" strokeWidth="2.2">
              <path d="M 60 27 L 60 14" fill="none" strokeWidth="2.8" />
              <ellipse cx="52" cy="13" rx="8" ry="4.5" fill="#4ADE80" transform="rotate(-22 52 13)" />
              <ellipse cx="68" cy="13" rx="8" ry="4.5" fill="#86EFAC" transform="rotate(22 68 13)" />
            </g>
          )}
          {hat === 'hat_wizard' && (
            <g stroke="#312E81" strokeWidth="2.2">
              <ellipse cx="60" cy="26" rx="25" ry="5.5" fill="#4F46E5" />
              <polygon points="45,25 63,4 75,25" fill="#4338CA" />
              <circle cx="59" cy="16" r="2.2" fill="#FDE047" stroke="none" />
              <circle cx="65" cy="21" r="1.8" fill="#FDE047" stroke="none" />
            </g>
          )}
          {hat === 'hat_bunny' && (
            <g stroke="#9D174D" strokeWidth="2.2">
              <ellipse cx="50" cy="13" rx="5.5" ry="14" fill="#FFFFFF" />
              <ellipse cx="50" cy="13" rx="2.5" ry="9" fill="#F9A8D4" stroke="none" />
              <ellipse cx="70" cy="13" rx="5.5" ry="14" fill="#FFFFFF" />
              <ellipse cx="70" cy="13" rx="2.5" ry="9" fill="#F9A8D4" stroke="none" />
            </g>
          )}
          {hat === 'hat_halo' && (
            <ellipse cx="60" cy="12" rx="16" ry="4.5" fill="none" stroke="#FACC15" strokeWidth="3.5" />
          )}
        </g>
      )}
    </g>
  );
}

// ============================================================================
// ALL 16 ANIMATED STICKER-STYLE PETS (CUSTOM VECTOR ILLUSTRATIONS)
// ============================================================================
function AnimatedStickerPet({
  speciesId = 'orange_cat',
  outfit = null,
  isSleeping = false,
  isWalking = false,
  isEating = false,
  isWaiting = false,
  isHappy = false,
  facing = 1,
  size = 94,
}) {
  const isFlyingType = ['blue_macaw', 'fluffy_bluebird', 'cosmic_star', 'fancy_goldfish', 'space_hamster'].includes(speciesId);
  const bodyAnim = isHappy
    ? 'pet-happy-jump'
    : isEating
    ? 'pet-nibble'
    : isWalking
    ? 'pet-waddle'
    : isWaiting
    ? 'pet-waiting'
    : isFlyingType
    ? 'pet-float'
    : 'pet-breathe';

  const renderEyes = (lx, rx, y, r = 4.2, color = '#4A2E21') => {
    if (isSleeping) {
      return (
        <g stroke={color} strokeWidth="2.6" fill="none" strokeLinecap="round">
          <path d={`M ${lx - 4} ${y} Q ${lx} ${y + 4} ${lx + 4} ${y}`} />
          <path d={`M ${rx - 4} ${y} Q ${rx} ${y + 4} ${rx + 4} ${y}`} />
        </g>
      );
    }
    if (isHappy || isEating) {
      return (
        <g stroke={color} strokeWidth="2.8" fill="none" strokeLinecap="round">
          <path d={`M ${lx - 4.5} ${y + 1.5} Q ${lx} ${y - 4.5} ${lx + 4.5} ${y + 1.5}`} />
          <path d={`M ${rx - 4.5} ${y + 1.5} Q ${rx} ${y - 4.5} ${rx + 4.5} ${y + 1.5}`} />
        </g>
      );
    }
    return (
      <g className="pet-blink">
        <circle cx={lx} cy={y} r={r} fill={color} />
        <circle cx={lx - 1.3} cy={y - 1.4} r={r * 0.38} fill="#FFFFFF" />
        {isWaiting && <circle cx={lx + 1.3} cy={y + 1.2} r={r * 0.24} fill="#FEF08A" />}
        <circle cx={rx} cy={y} r={r} fill={color} />
        <circle cx={rx - 1.3} cy={y - 1.4} r={r * 0.38} fill="#FFFFFF" />
        {isWaiting && <circle cx={rx + 1.3} cy={y + 1.2} r={r * 0.24} fill="#FEF08A" />}
      </g>
    );
  };

  return (
    <div
      className="relative inline-flex items-center justify-center select-none"
      style={{
        width: size,
        height: size,
        transform: `scaleX(${facing})`,
        transition: 'transform 200ms ease',
      }}
    >
      <svg
        viewBox="0 0 120 120"
        className={`w-full h-full overflow-visible ${bodyAnim}`}
        style={{
          filter:
            'drop-shadow(0px 0px 2.5px #ffffff) drop-shadow(0px 0px 2.5px #ffffff) drop-shadow(0px 6px 8px rgba(74,46,33,0.22))',
        }}
      >
        {speciesId === 'orange_cat' && (
          <g stroke="#5C3D2E" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 86 86 Q 108 76 102 52" fill="none" stroke="#F59E42" strokeWidth="10" className="pet-tail" style={{ transformOrigin: '86px 86px' }} />
            <path d="M 86 86 Q 108 76 102 52" fill="none" stroke="#5C3D2E" strokeWidth="2.8" className="pet-tail" style={{ transformOrigin: '86px 86px' }} />
            <ellipse cx="58" cy="82" rx="26" ry="22" fill="#F8B259" />
            <ellipse cx="58" cy="88" rx="14" ry="12" fill="#FFF3E0" stroke="none" />
            <polygon points="34,46 30,20 50,34" fill="#F8B259" className="pet-ear" style={{ transformOrigin: '40px 42px' }} />
            <polygon points="82,46 86,20 66,34" fill="#F8B259" className="pet-ear" style={{ transformOrigin: '76px 42px' }} />
            <circle cx="58" cy="52" r="26" fill="#F8B259" />
            <path d="M 52 28 L 54 36 M 58 26 L 58 36 M 64 28 L 62 36" stroke="#C96F24" strokeWidth="3" />
            {renderEyes(47, 69, 52)}
            <ellipse cx="40" cy="58" rx="4.5" ry="2.5" fill="#FDA4AF" stroke="none" />
            <ellipse cx="76" cy="58" rx="4.5" ry="2.5" fill="#FDA4AF" stroke="none" />
            <path d="M 54 58 Q 58 62 62 58" fill="none" />
            <circle cx="46" cy="100" r="6" fill="#FFF3E0" />
            <circle cx="70" cy="100" r="6" fill="#FFF3E0" />
          </g>
        )}

        {speciesId === 'shiba_inu' && (
          <g stroke="#5C3D2E" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="92" cy="70" r="11" fill="#F4B266" className="pet-tail" style={{ transformOrigin: '84px 76px' }} />
            <ellipse cx="58" cy="84" rx="26" ry="20" fill="#F4B266" />
            <ellipse cx="58" cy="88" rx="16" ry="14" fill="#FFFDF7" stroke="none" />
            <polygon points="34,42 32,18 50,32" fill="#F4B266" className="pet-ear" style={{ transformOrigin: '40px 38px' }} />
            <polygon points="82,42 84,18 66,32" fill="#F4B266" className="pet-ear" style={{ transformOrigin: '76px 38px' }} />
            <ellipse cx="58" cy="52" rx="27" ry="24" fill="#F4B266" />
            <path d="M 33 56 Q 58 46 83 56 Q 82 74 58 76 Q 34 74 33 56 Z" fill="#FFFDF7" stroke="none" />
            <rect x="40" y="68" width="36" height="7" rx="3.5" fill="#EF4444" />
            <circle cx="58" cy="76" r="4" fill="#FACC15" />
            {renderEyes(47, 69, 50)}
            <ellipse cx="58" cy="56" rx="4" ry="3" fill="#4A2E21" />
            <path d="M 54 61 Q 58 65 62 61" fill="none" />
          </g>
        )}

        {speciesId === 'carrot_bunny' && (
          <g stroke="#5C3D2E" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="46" cy="24" rx="8" ry="20" fill="#C9A286" className="pet-ear" style={{ transformOrigin: '48px 40px' }} />
            <ellipse cx="46" cy="24" rx="4" ry="13" fill="#FBCFE8" stroke="none" className="pet-ear" style={{ transformOrigin: '48px 40px' }} />
            <ellipse cx="70" cy="24" rx="8" ry="20" fill="#C9A286" className="pet-ear" style={{ transformOrigin: '68px 40px' }} />
            <ellipse cx="70" cy="24" rx="4" ry="13" fill="#FBCFE8" stroke="none" className="pet-ear" style={{ transformOrigin: '68px 40px' }} />
            <circle cx="88" cy="86" r="9" fill="#FFF7ED" />
            <ellipse cx="58" cy="84" rx="25" ry="20" fill="#C9A286" />
            <circle cx="58" cy="56" r="24" fill="#C9A286" />
            {renderEyes(48, 68, 55)}
            <ellipse cx="41" cy="61" rx="4" ry="2.5" fill="#FDA4AF" stroke="none" />
            <ellipse cx="75" cy="61" rx="4" ry="2.5" fill="#FDA4AF" stroke="none" />
            <polygon points="55,60 61,60 58,64" fill="#FB7185" />
            <polygon points="72,96 102,88 94,104" fill="#F97316" />
            <path d="M 98 92 L 106 86 M 98 96 L 108 96" stroke="#22C55E" strokeWidth="3" />
          </g>
        )}

        {speciesId === 'golden_hamster' && (
          <g stroke="#5C3D2E" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="36" cy="36" r="10" fill="#E8A462" className="pet-ear" style={{ transformOrigin: '40px 42px' }} />
            <circle cx="84" cy="36" r="10" fill="#E8A462" className="pet-ear" style={{ transformOrigin: '80px 42px' }} />
            <ellipse cx="60" cy="68" rx="34" ry="34" fill="#E8A462" />
            <ellipse cx="60" cy="80" rx="24" ry="20" fill="#FFF7ED" stroke="none" />
            <circle cx="36" cy="64" r="11" fill="#FDE6D2" stroke="none" />
            <circle cx="84" cy="64" r="11" fill="#FDE6D2" stroke="none" />
            {renderEyes(47, 73, 56)}
            <ellipse cx="38" cy="64" rx="5" ry="3" fill="#FDA4AF" stroke="none" />
            <ellipse cx="82" cy="64" rx="5" ry="3" fill="#FDA4AF" stroke="none" />
            <path d="M 55 63 Q 60 67 65 63" fill="none" />
          </g>
        )}

        {speciesId === 'blue_macaw' && (
          <g stroke="#334155" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 74 86 L 98 106 L 82 92 Z" fill="#0284C7" />
            <ellipse cx="58" cy="64" rx="24" ry="32" fill="#FACC15" />
            <path d="M 38 42 Q 58 20 78 44 Q 82 78 68 92 Q 58 60 38 42 Z" fill="#0EA5E9" />
            <path d="M 64 56 Q 94 52 88 82 Q 70 84 64 56 Z" fill="#0284C7" className="pet-wing" style={{ transformOrigin: '66px 60px' }} />
            <ellipse cx="48" cy="46" rx="10" ry="8" fill="#FFFFFF" stroke="none" />
            {renderEyes(45, 58, 45, 3.6, '#1E293B')}
            <path d="M 36 48 Q 22 54 32 66 Q 42 62 42 52 Z" fill="#334155" />
          </g>
        )}

        {speciesId === 'meadow_turtle' && (
          <g stroke="#365314" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="44" cy="92" rx="9" ry="7" fill="#86EFAC" />
            <ellipse cx="78" cy="92" rx="9" ry="7" fill="#86EFAC" />
            <path d="M 36 84 A 30 28 0 0 1 96 84 Z" fill="#4D7C0F" />
            <path d="M 48 62 L 66 58 L 84 64 M 66 58 L 66 84" stroke="#A3E635" strokeWidth="2.2" fill="none" />
            <circle cx="34" cy="68" r="18" fill="#86EFAC" />
            {renderEyes(27, 41, 66, 3.5, '#14532D')}
            <path d="M 28 74 Q 34 78 40 74" fill="none" />
          </g>
        )}

        {speciesId === 'fluffy_bluebird' && (
          <g stroke="#1E3A8A" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 34 62 Q 10 38 24 72 Z" fill="#38BDF8" className="pet-wing" style={{ transformOrigin: '36px 64px' }} />
            <path d="M 86 62 Q 110 38 96 72 Z" fill="#38BDF8" className="pet-wing" style={{ transformOrigin: '84px 64px' }} />
            <circle cx="60" cy="64" r="28" fill="#60A5FA" />
            <ellipse cx="60" cy="76" rx="18" ry="14" fill="#DBEAFE" stroke="none" />
            {renderEyes(49, 71, 56, 4, '#1E3A8A')}
            <polygon points="56,62 64,62 60,69" fill="#FACC15" />
            <ellipse cx="42" cy="63" rx="4" ry="2.5" fill="#FDA4AF" stroke="none" />
            <ellipse cx="78" cy="63" rx="4" ry="2.5" fill="#FDA4AF" stroke="none" />
          </g>
        )}

        {speciesId === 'coral_chameleon' && (
          <g stroke="#7F1D1D" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 20 96 Q 60 88 102 96" stroke="#78350F" strokeWidth="6" fill="none" />
            <path d="M 86 80 Q 104 82 98 96 Q 90 100 88 90" fill="none" stroke="#FB7185" strokeWidth="7" className="pet-tail" style={{ transformOrigin: '86px 80px' }} />
            <path d="M 36 80 Q 48 44 86 66 Q 92 84 64 84 Z" fill="#F43F5E" />
            <circle cx="42" cy="60" r="16" fill="#FB7185" />
            <circle cx="38" cy="58" r="7" fill="#FFF1F2" />
            <circle cx="38" cy="58" r="3.5" fill="#7F1D1D" className="pet-blink" />
          </g>
        )}

        {speciesId === 'baby_dragon' && (
          <g stroke="#7C2D12" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 76 58 Q 106 34 102 68 Q 86 72 76 58 Z" fill="#FDBA74" className="pet-wing" style={{ transformOrigin: '76px 58px' }} />
            <path d="M 80 86 Q 104 88 106 72" fill="none" stroke="#F97316" strokeWidth="8" className="pet-tail" style={{ transformOrigin: '80px 86px' }} />
            <polygon points="44,34 38,16 52,28" fill="#FDE047" />
            <polygon points="72,34 78,16 64,28" fill="#FDE047" />
            <ellipse cx="58" cy="82" rx="24" ry="22" fill="#F97316" />
            <ellipse cx="58" cy="86" rx="14" ry="14" fill="#FEF08A" stroke="none" />
            <circle cx="58" cy="52" r="24" fill="#FB923C" />
            {renderEyes(47, 69, 50, 4.2, '#431407')}
            <path d="M 52 60 Q 58 64 64 60" fill="none" />
          </g>
        )}

        {speciesId === 'cosmic_star' && (
          <g stroke="#312E81" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <polygon
              points="60,14 73,42 104,46 81,67 87,98 60,82 33,98 39,67 16,46 47,42"
              fill="#6366F1"
            />
            <circle cx="42" cy="48" r="2.5" fill="#FEF08A" stroke="none" className="pet-twinkle" />
            <circle cx="78" cy="48" r="2.5" fill="#F9A8D4" stroke="none" className="pet-twinkle" />
            <circle cx="60" cy="30" r="3" fill="#FEF08A" stroke="none" className="pet-twinkle" />
            {renderEyes(50, 70, 58, 4.8, '#1E1B4B')}
            <path d="M 55 67 Q 60 72 65 67" fill="none" stroke="#FFFFFF" strokeWidth="2.5" />
          </g>
        )}

        {speciesId === 'mini_griffin' && (
          <g stroke="#78350F" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 74 58 Q 108 32 100 72 Q 82 74 74 58 Z" fill="#FDE68A" className="pet-wing" style={{ transformOrigin: '74px 58px' }} />
            <ellipse cx="58" cy="82" rx="25" ry="20" fill="#D97706" />
            <circle cx="56" cy="52" r="24" fill="#F59E0B" />
            <circle cx="56" cy="50" r="18" fill="#FFFBEB" stroke="none" />
            {renderEyes(46, 66, 48, 4, '#451A03')}
            <path d="M 52 54 Q 56 64 60 54 Z" fill="#FACC15" />
          </g>
        )}

        {speciesId === 'rainbow_unicorn' && (
          <g stroke="#6B21A8" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 84 82 Q 108 68 104 94" fill="none" stroke="#F472B6" strokeWidth="9" className="pet-tail" style={{ transformOrigin: '84px 82px' }} />
            <ellipse cx="60" cy="82" rx="26" ry="20" fill="#FFFFFF" />
            <polygon points="56,30 60,8 66,30" fill="#FDE047" />
            <path d="M 42 36 Q 58 24 76 38 Q 84 54 74 68" fill="#C084FC" stroke="none" />
            <circle cx="56" cy="52" r="23" fill="#FFFFFF" />
            {renderEyes(46, 66, 52, 4, '#4C1D95')}
            <ellipse cx="40" cy="58" rx="4" ry="2.5" fill="#F9A8D4" stroke="none" />
            <ellipse cx="72" cy="58" rx="4" ry="2.5" fill="#F9A8D4" stroke="none" />
            <circle cx="88" cy="30" r="3" fill="#FDE047" stroke="none" className="pet-twinkle" />
          </g>
        )}

        {speciesId === 'fancy_goldfish' && (
          <g stroke="#9A3412" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="32" cy="30" r="5" fill="#BAE6FD" stroke="#38BDF8" strokeWidth="2" className="pet-bubble" />
            <circle cx="22" cy="46" r="3.5" fill="#BAE6FD" stroke="#38BDF8" strokeWidth="2" className="pet-bubble" />
            <path d="M 84 64 Q 112 42 106 64 Q 112 86 84 64 Z" fill="#FDBA74" className="pet-tail" style={{ transformOrigin: '84px 64px' }} />
            <ellipse cx="56" cy="64" rx="30" ry="24" fill="#FB923C" />
            <ellipse cx="52" cy="72" rx="20" ry="12" fill="#FED7AA" stroke="none" />
            {renderEyes(42, 54, 58, 4, '#431407')}
            <path d="M 30 66 Q 36 70 40 66" fill="none" />
          </g>
        )}

        {speciesId === 'woodland_owl' && (
          <g stroke="#451A03" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="60" cy="68" rx="28" ry="32" fill="#92400E" />
            <ellipse cx="60" cy="76" rx="18" ry="20" fill="#FEF3C7" stroke="none" />
            <circle cx="48" cy="54" r="11" fill="#FFFBEB" />
            <circle cx="72" cy="54" r="11" fill="#FFFBEB" />
            {renderEyes(48, 72, 54, 4.5, '#451A03')}
            <polygon points="56,60 64,60 60,68" fill="#F59E0B" />
          </g>
        )}

        {speciesId === 'lilypad_frog' && (
          <g stroke="#14532D" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="60" cy="96" rx="40" ry="12" fill="#22C55E" />
            <circle cx="44" cy="42" r="12" fill="#4ADE80" />
            <circle cx="76" cy="42" r="12" fill="#4ADE80" />
            <ellipse cx="60" cy="68" rx="30" ry="24" fill="#4ADE80" />
            <ellipse cx="60" cy="76" rx="20" ry="13" fill="#DCFCE7" stroke="none" />
            {renderEyes(44, 76, 42, 4.2, '#14532D')}
            <path d="M 46 66 Q 60 76 74 66" fill="none" />
            <path d="M 62 71 Q 67 80 71 71" fill="#FB7185" />
          </g>
        )}

        {speciesId === 'space_hamster' && (
          <g stroke="#334155" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="34" y="64" width="52" height="40" rx="18" fill="#F1F5F9" />
            <rect x="48" y="76" width="24" height="14" rx="5" fill="#93C5FD" />
            <circle cx="60" cy="48" r="24" fill="#E8A462" />
            <circle cx="44" cy="30" r="7" fill="#E8A462" />
            <circle cx="76" cy="30" r="7" fill="#E8A462" />
            <ellipse cx="60" cy="56" rx="16" ry="12" fill="#FFF7ED" stroke="none" />
            {renderEyes(50, 70, 48, 3.8, '#1E293B')}
            <circle cx="60" cy="48" r="31" fill="#BAE6FD" fillOpacity="0.28" stroke="#7DD3FC" strokeWidth="3.2" />
            <path d="M 40 34 Q 48 24 62 24" fill="none" stroke="#FFFFFF" strokeWidth="3" opacity="0.85" />
          </g>
        )}

        <PetOutfitLayer outfit={outfit} speciesId={speciesId} />
      </svg>

      {isSleeping && (
        <div
          className="absolute -top-2 -right-1 text-indigo-100 font-black text-sm pet-zzz drop-shadow"
          style={{ transform: `scaleX(${facing})` }}
        >
          Zzz
        </div>
      )}

      {isHappy && !isSleeping && (
        <div
          className="absolute -top-3 -right-2 text-base pet-twinkle pointer-events-none"
          style={{ transform: `scaleX(${facing})` }}
        >
          ✨
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MINIGAME 1: CATCH THE TREATS
// ============================================================================
function CatchTreatsGame({ onFinish, onExit, muted }) {
  const [basketX, setBasketX] = useState(50);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(22);
  const [items, setItems] = useState([]);
  const [popups, setPopups] = useState([]);
  const [ended, setEnded] = useState(false);
  const basketRef = useRef(50);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);

  useEffect(() => {
    basketRef.current = basketX;
  }, [basketX]);

  useEffect(() => {
    if (ended) return;
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setEnded(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [ended]);

  useEffect(() => {
    if (ended) return;
    const spawner = setInterval(() => {
      const roll = Math.random();
      let type = 'treat';
      let emoji = ['🍓', '🧋', '🍰', '🍪', '💖'][Math.floor(Math.random() * 5)];
      let speed = 3.4 + Math.random() * 2.4;
      if (roll > 0.86) {
        type = 'gold';
        emoji = '🌟';
        speed = 4.8 + Math.random() * 1.8;
      } else if (roll < 0.16) {
        type = 'bomb';
        emoji = '💣';
        speed = 3.6 + Math.random() * 2.0;
      }
      setItems((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).slice(2),
          x: 12 + Math.random() * 76,
          y: 0,
          emoji,
          type,
          speed,
        },
      ]);
    }, 520);

    const loop = setInterval(() => {
      setItems((prev) => {
        const next = [];
        for (const it of prev) {
          const ny = it.y + it.speed;
          if (ny >= 79 && ny <= 94 && Math.abs(it.x - basketRef.current) < 15) {
            const popId = Math.random().toString(36).slice(2);
            if (it.type === 'bomb') {
              playSfx('miss', muted);
              comboRef.current = 0;
              setCombo(0);
              scoreRef.current = Math.max(0, scoreRef.current - 15);
              setScore(scoreRef.current);
              setPopups((p) => [...p.slice(-5), { id: popId, x: it.x, text: '-15 💥', color: 'text-rose-600' }]);
            } else {
              comboRef.current += 1;
              setCombo(comboRef.current);
              const bonus = it.type === 'gold' ? 30 : 10 + Math.min(15, comboRef.current * 2);
              playSfx(it.type === 'gold' ? 'perfect' : 'catch', muted);
              scoreRef.current += bonus;
              setScore(scoreRef.current);
              setPopups((p) => [
                ...p.slice(-5),
                {
                  id: popId,
                  x: it.x,
                  text: it.type === 'gold' ? `+${bonus} ✨` : `+${bonus}`,
                  color: it.type === 'gold' ? 'text-amber-500' : 'text-emerald-600',
                },
              ]);
            }
            setTimeout(() => {
              setPopups((p) => p.filter((x) => x.id !== popId));
            }, 650);
          } else if (ny < 100) {
            next.push({ ...it, y: ny });
          }
        }
        return next;
      });
    }, 45);

    return () => {
      clearInterval(spawner);
      clearInterval(loop);
    };
  }, [ended, muted]);

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const pct = clamp(((clientX - rect.left) / rect.width) * 100, 10, 90);
    setBasketX(pct);
  };

  if (ended) {
    const coins = Math.max(18, Math.round(score * 0.35));
    return (
      <div className="text-center py-6 space-y-4">
        <div className="text-5xl">🍓🎉</div>
        <h3 className="text-lg font-black text-gray-800">Time&apos;s Up!</h3>
        <p className="text-sm font-bold text-gray-600">
          Score: <span className="text-rose-600">{score}</span> • Earned{' '}
          <span className="text-amber-600">+{coins}🪙</span>
        </p>
        <button
          onClick={() => onFinish('catch', 'Catch the Treats', score, coins)}
          className="px-5 py-2.5 rounded-2xl bg-rose-500 text-white font-black text-sm shadow active:scale-95 transition"
        >
          Collect Coins &amp; Save Score
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs font-black text-gray-700">
        <span>🍓 {score}</span>
        {combo >= 2 && (
          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px]">
            🔥 x{combo} Combo
          </span>
        )}
        <span>⏱️ {timeLeft}s</span>
        <button onClick={onExit} className="text-rose-500">Quit</button>
      </div>
      <div
        onMouseMove={handleMove}
        onTouchMove={handleMove}
        className="relative h-64 rounded-3xl bg-gradient-to-b from-sky-100 to-amber-50 border-2 border-amber-200 overflow-hidden touch-none select-none cursor-ew-resize"
      >
        {items.map((it) => (
          <span
            key={it.id}
            style={{ left: `${it.x}%`, top: `${it.y}%` }}
            className={`absolute -translate-x-1/2 text-2xl pointer-events-none ${it.type === 'gold' ? 'drop-shadow-md scale-110' : ''}`}
          >
            {it.emoji}
          </span>
        ))}
        {popups.map((p) => (
          <span
            key={p.id}
            style={{ left: `${p.x}%`, top: '72%' }}
            className={`absolute -translate-x-1/2 text-xs font-black pet-bubble pointer-events-none ${p.color}`}
          >
            {p.text}
          </span>
        ))}
        <div
          style={{ left: `${basketX}%`, top: '86%' }}
          className="absolute -translate-x-1/2 -translate-y-1/2 text-4xl pointer-events-none"
        >
          🧺
        </div>
      </div>
      <p className="text-[11px] text-center text-gray-500 font-semibold">
        Catch treats &amp; 🌟 stars for combos — dodge the 💣 bombs!
      </p>
    </div>
  );
}

// ============================================================================
// MINIGAME 2: COUPLE MEMORY MATCH
// ============================================================================
function CoupleMemoryGame({ onFinish, onExit, muted }) {
  const emojis = ['🐱', '🐶', '🐰', '🦄', '🍓', '💖'];
  const [cards, setCards] = useState(() =>
    [...emojis, ...emojis]
      .sort(() => Math.random() - 0.5)
      .map((emoji, idx) => ({ id: idx, emoji, flipped: false, matched: false }))
  );
  const [selected, setSelected] = useState([]);
  const [moves, setMoves] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bonusPts, setBonusPts] = useState(0);
  const [won, setWon] = useState(false);

  const handleFlip = (idx) => {
    if (selected.length === 2 || cards[idx].flipped || cards[idx].matched) return;
    playSfx('chop', muted);
    const nextCards = cards.map((c, i) => (i === idx ? { ...c, flipped: true } : c));
    const nextSel = [...selected, idx];
    setCards(nextCards);
    setSelected(nextSel);

    if (nextSel.length === 2) {
      setMoves((m) => m + 1);
      const [a, b] = nextSel;
      if (nextCards[a].emoji === nextCards[b].emoji) {
        const nextStreak = streak + 1;
        setStreak(nextStreak);
        if (nextStreak >= 2) setBonusPts((bp) => bp + nextStreak * 15);
        playSfx(nextStreak >= 2 ? 'perfect' : 'match', muted);
        setTimeout(() => {
          setCards((prev) => {
            const updated = prev.map((c, i) =>
              i === a || i === b ? { ...c, matched: true } : c
            );
            if (updated.every((c) => c.matched)) {
              playSfx('cookDone', muted);
              setWon(true);
            }
            return updated;
          });
          setSelected([]);
        }, 280);
      } else {
        setStreak(0);
        setTimeout(() => {
          playSfx('miss', muted);
          setCards((prev) =>
            prev.map((c, i) => (i === a || i === b ? { ...c, flipped: false } : c))
          );
          setSelected([]);
        }, 620);
      }
    }
  };

  if (won) {
    const score = Math.max(50, 220 - moves * 10 + bonusPts);
    const coins = Math.max(25, Math.round(score * 0.3));
    return (
      <div className="text-center py-6 space-y-4">
        <div className="text-5xl">🃏✨</div>
        <h3 className="text-lg font-black text-gray-800">All Matched in {moves} Moves!</h3>
        <p className="text-sm font-bold text-gray-600">
          Score: <span className="text-rose-600">{score}</span> • Earned{' '}
          <span className="text-amber-600">+{coins}🪙</span>
        </p>
        <button
          onClick={() => onFinish('memory', 'Couple Memory', score, coins)}
          className="px-5 py-2.5 rounded-2xl bg-rose-500 text-white font-black text-sm shadow active:scale-95 transition"
        >
          Collect Coins &amp; Save Score
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs font-black text-gray-700">
        <span>🃏 Moves: {moves}</span>
        {streak >= 2 && (
          <span className="px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 text-[10px]">
            ✨ {streak}x Streak!
          </span>
        )}
        <button onClick={onExit} className="text-rose-500">Quit</button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {cards.map((card, idx) => (
          <button
            key={card.id}
            onClick={() => handleFlip(idx)}
            className={`h-16 rounded-2xl text-2xl font-bold border-2 transition-all active:scale-95 ${
              card.matched
                ? 'bg-emerald-50 border-emerald-300 scale-95'
                : card.flipped
                ? 'bg-white border-pink-300 shadow-xs'
                : 'bg-gradient-to-br from-pink-400 to-rose-400 border-pink-200 text-white'
            }`}
          >
            {card.flipped || card.matched ? card.emoji : '🐾'}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MINIGAME 3: 15s HEART RUSH
// ============================================================================
function HeartRushGame({ onFinish, onExit, muted }) {
  const spawnHeart = () => {
    const isGold = Math.random() > 0.78;
    const icons = ['💖', '💕', '💝', '🌸'];
    return {
      id: Math.random().toString(36).slice(2),
      x: 15 + Math.random() * 70,
      y: 16 + Math.random() * 68,
      emoji: isGold ? '💛' : icons[Math.floor(Math.random() * icons.length)],
      pts: isGold ? 25 : 10,
      isGold,
    };
  };

  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [targets, setTargets] = useState(() => [spawnHeart(), spawnHeart(), spawnHeart()]);
  const [bursts, setBursts] = useState([]);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (ended) return;
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setEnded(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [ended]);

  const handleTap = (t) => {
    if (ended) return;
    playSfx(t.isGold ? 'perfect' : 'catch', muted);
    setScore((s) => s + t.pts);
    const burstId = Math.random().toString(36).slice(2);
    setBursts((prev) => [...prev.slice(-5), { id: burstId, x: t.x, y: t.y, pts: t.pts, isGold: t.isGold }]);
    setTimeout(() => setBursts((prev) => prev.filter((b) => b.id !== burstId)), 550);
    setTargets((prev) => prev.map((item) => (item.id === t.id ? spawnHeart() : item)));
  };

  if (ended) {
    const coins = Math.max(20, Math.round(score * 0.25));
    return (
      <div className="text-center py-6 space-y-4">
        <div className="text-5xl">💖🔥</div>
        <h3 className="text-lg font-black text-gray-800">Heart Rush Complete!</h3>
        <p className="text-sm font-bold text-gray-600">
          Score: <span className="text-rose-600">{score}</span> • Earned{' '}
          <span className="text-amber-600">+{coins}🪙</span>
        </p>
        <button
          onClick={() => onFinish('rush', '15s Heart Rush', score, coins)}
          className="px-5 py-2.5 rounded-2xl bg-rose-500 text-white font-black text-sm shadow active:scale-95 transition"
        >
          Collect Coins &amp; Save Score
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs font-black text-gray-700">
        <span>💖 Score: {score}</span>
        <span>⏱️ {timeLeft}s</span>
        <button onClick={onExit} className="text-rose-500">Quit</button>
      </div>
      <div className="relative h-64 rounded-3xl bg-gradient-to-br from-rose-100 to-pink-50 border-2 border-rose-200 overflow-hidden select-none">
        {targets.map((t) => (
          <button
            key={t.id}
            onClick={() => handleTap(t)}
            style={{ left: `${t.x}%`, top: `${t.y}%` }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full shadow-md flex items-center justify-center text-3xl active:scale-75 transition ${
              t.isGold ? 'bg-amber-100 ring-2 ring-amber-400 animate-pulse' : 'bg-white/90'
            }`}
          >
            {t.emoji}
          </button>
        ))}
        {bursts.map((b) => (
          <span
            key={b.id}
            style={{ left: `${b.x}%`, top: `${b.y}%` }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 text-xs font-black pet-bubble pointer-events-none ${
              b.isGold ? 'text-amber-600' : 'text-rose-600'
            }`}
          >
            +{b.pts}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-center text-gray-500 font-semibold">
        Tap hearts fast! Golden 💛 hearts give +25 bonus points!
      </p>
    </div>
  );
}

// ============================================================================
// INTERACTIVE MINIGAME 4: BUBBLE BATH & SHOWER MINIGAME
// ============================================================================
function BathMinigameModal({ pet, onComplete, onClose, muted }) {
  const [phase, setPhase] = useState('scrub');
  const [bubbles, setBubbles] = useState([]);
  const [scrubProgress, setScrubProgress] = useState(0);
  const [rinseProgress, setRinseProgress] = useState(0);
  const [toolPos, setToolPos] = useState({ x: 50, y: 50 });
  const lastSoundRef = useRef(0);

  const handleMove = (e) => {
    if (phase === 'done') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = clamp(((clientX - rect.left) / rect.width) * 100, 8, 92);
    const y = clamp(((clientY - rect.top) / rect.height) * 100, 8, 92);
    setToolPos({ x, y });

    const nearPet = Math.hypot(x - 50, y - 54) < 34;
    if (!nearPet) return;

    const nowTs = Date.now();
    if (nowTs - lastSoundRef.current > 180) {
      lastSoundRef.current = nowTs;
      playSfx('bath', muted);
    }

    if (phase === 'scrub') {
      setBubbles((prev) => [
        ...prev.slice(-18),
        {
          id: Math.random().toString(36).slice(2),
          x: x + (Math.random() * 14 - 7),
          y: y + (Math.random() * 14 - 7),
          size: 16 + Math.random() * 14,
        },
      ]);
      setScrubProgress((prev) => {
        const next = Math.min(100, prev + 3.2);
        if (next >= 100) {
          setTimeout(() => setPhase('rinse'), 220);
        }
        return next;
      });
    } else if (phase === 'rinse') {
      setBubbles((prev) => prev.slice(1));
      setRinseProgress((prev) => {
        const next = Math.min(100, prev + 3.5);
        if (next >= 100) {
          setBubbles([]);
          setPhase('done');
          playSfx('perfect', muted);
        }
        return next;
      });
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-sky-950/45 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-[350px] rounded-[32px] bg-white/95 backdrop-blur-xl border-2 border-white shadow-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-sky-900">
              {phase === 'scrub' && `🧽 Step 1/2: Scrub ${pet.name}!`}
              {phase === 'rinse' && `🚿 Step 2/2: Rinse with Water!`}
              {phase === 'done' && `✨ Squeaky Clean!`}
            </h3>
            <p className="text-[10px] font-bold text-sky-700">
              {phase === 'scrub' && 'Rub the sponge over your pet to make soap bubbles!'}
              {phase === 'rinse' && 'Spray water over your pet to wash off all the bubbles!'}
              {phase === 'done' && `${pet.name} smells fresh and sparkling clean!`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full bg-gray-100 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          onMouseMove={handleMove}
          onTouchMove={handleMove}
          onClick={handleMove}
          className="relative h-56 rounded-3xl bg-gradient-to-b from-sky-100 via-cyan-50 to-sky-200 border-2 border-sky-200 overflow-hidden touch-none select-none cursor-none flex items-center justify-center"
        >
          <div className="relative flex flex-col items-center">
            <AnimatedStickerPet
              speciesId={pet.speciesId}
              isEating={phase !== 'done'}
              size={118}
            />
            <div className="w-40 h-7 -mt-3 rounded-b-3xl bg-white border-2 border-sky-300 shadow-inner" />
          </div>

          {bubbles.map((b) => (
            <span
              key={b.id}
              style={{ left: `${b.x}%`, top: `${b.y}%`, fontSize: `${b.size}px` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none"
            >
              🫧
            </span>
          ))}

          {phase === 'rinse' && (
            <div
              style={{ left: `${toolPos.x}%`, top: `${toolPos.y + 8}%` }}
              className="absolute -translate-x-1/2 text-xl pointer-events-none animate-pulse"
            >
              💧💦
            </div>
          )}

          {phase !== 'done' && (
            <div
              style={{ left: `${toolPos.x}%`, top: `${toolPos.y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-4xl pointer-events-none drop-shadow-md"
            >
              {phase === 'scrub' ? '🧽' : '🚿'}
            </div>
          )}
        </div>

        {phase !== 'done' ? (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-black text-sky-800">
              <span>{phase === 'scrub' ? '🫧 Bubble Lather' : '💧 Rinse Progress'}</span>
              <span>{Math.round(phase === 'scrub' ? scrubProgress : rinseProgress)}%</span>
            </div>
            <div className="h-3 rounded-full bg-sky-100 overflow-hidden border border-sky-200">
              <div
                className={`h-full rounded-full transition-all duration-150 ${
                  phase === 'scrub' ? 'bg-pink-400' : 'bg-sky-400'
                }`}
                style={{ width: `${phase === 'scrub' ? scrubProgress : rinseProgress}%` }}
              />
            </div>
          </div>
        ) : (
          <button
            onClick={onComplete}
            className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 text-white font-black text-sm shadow-md active:scale-95 transition"
          >
            All Done! (+10🪙 &amp; 100% Clean) ✨
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// INTERACTIVE MINIGAME 5: MULTI-STAGE STOVE COOKING GAME (PREP -> FRY -> PLATE)
// ============================================================================
const RECIPE_PREP_STEPS = {
  fried_egg: {
    ingredients: ['🥚', '🧈', '🧂', '🌿'],
    prepAction: 'Crack & season!',
    garnish: '🌿',
  },
  pancakes: {
    ingredients: ['🥣', '🥚', '🥛', '🍯'],
    prepAction: 'Whisk the batter!',
    garnish: '🍓',
  },
  cheese_toast: {
    ingredients: ['🍞', '🧈', '🧀', '🍅'],
    prepAction: 'Stack the layers!',
    garnish: '✨',
  },
  heart_bento: {
    ingredients: ['🍙', '🍤', '🥦', '🍓'],
    prepAction: 'Chop & pack bento!',
    garnish: '💖',
  },
};

function CookingMinigameModal({ coins, onCompleteCook, onClose, muted }) {
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [phase, setPhase] = useState('select');
  const [prepIndex, setPrepIndex] = useState(0);
  const [prepParticles, setPrepParticles] = useState([]);

  const [flipCount, setFlipCount] = useState(0);
  const [cursor, setCursor] = useState(14);
  const [perfectHits, setPerfectHits] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);
  const [feedback, setFeedback] = useState('');
  const dirRef = useRef(1);

  const [garnishes, setGarnishes] = useState([
    { id: 0, x: 30, y: 38, placed: false },
    { id: 1, x: 70, y: 38, placed: false },
    { id: 2, x: 50, y: 66, placed: false },
  ]);

  useEffect(() => {
    if (phase !== 'fry') return;
    playSfx('panSizzle', muted);
    const speed = 3.2 + flipCount * 0.9;
    const moveId = setInterval(() => {
      setCursor((prev) => {
        let next = prev + dirRef.current * speed;
        if (next >= 92) {
          next = 92;
          dirRef.current = -1;
        } else if (next <= 8) {
          next = 8;
          dirRef.current = 1;
        }
        return next;
      });
    }, 26);

    const sizzleId = setInterval(() => {
      playSfx('panSizzle', muted);
    }, 480);

    return () => {
      clearInterval(moveId);
      clearInterval(sizzleId);
    };
  }, [phase, flipCount, muted]);

  const prepConfig = selectedRecipe ? RECIPE_PREP_STEPS[selectedRecipe.id] : null;

  const handleSelectRecipe = (rec) => {
    playSfx('chop', muted);
    setSelectedRecipe(rec);
    setPhase('prep');
    setPrepIndex(0);
    setFlipCount(0);
    setPerfectHits(0);
    setFeedback('');
    setGarnishes([
      { id: 0, x: 30, y: 38, placed: false },
      { id: 1, x: 70, y: 38, placed: false },
      { id: 2, x: 50, y: 66, placed: false },
    ]);
  };

  const handlePrepTap = () => {
    if (!prepConfig) return;
    playSfx('chop', muted);
    const pid = Date.now() + Math.random();
    const emoji = prepConfig.ingredients[prepIndex];
    setPrepParticles((prev) => [...prev.slice(-6), { id: pid, emoji, x: 35 + Math.random() * 30 }]);
    setTimeout(() => setPrepParticles((prev) => prev.filter((p) => p.id !== pid)), 600);

    if (prepIndex + 1 >= prepConfig.ingredients.length) {
      setTimeout(() => {
        playSfx('panSizzle', muted);
        setPhase('fry');
      }, 280);
    } else {
      setPrepIndex((i) => i + 1);
    }
  };

  const handleFlipTap = () => {
    if (isFlipping) return;
    setIsFlipping(true);
    playSfx('flip', muted);

    const isPerfect = cursor >= 38 && cursor <= 62;
    const isGood = cursor >= 26 && cursor <= 74;

    if (isPerfect) {
      setPerfectHits((h) => h + 1);
      setFeedback('⭐ PERFECT FLIP!');
      setTimeout(() => playSfx('perfect', muted), 130);
    } else if (isGood) {
      setFeedback('✨ GOLDEN SIZZLE!');
      setTimeout(() => playSfx('panSizzle', muted), 130);
    } else {
      setFeedback('😅 TOO EARLY/LATE!');
      setTimeout(() => playSfx('miss', muted), 120);
    }

    setTimeout(() => {
      setIsFlipping(false);
      if (flipCount + 1 >= 3) {
        setPhase('plate');
      } else {
        setFlipCount((c) => c + 1);
      }
    }, 360);
  };

  const handlePlaceGarnish = (id) => {
    playSfx('catch', muted);
    setGarnishes((prev) => {
      const next = prev.map((g) => (g.id === id ? { ...g, placed: true } : g));
      if (next.every((g) => g.placed)) {
        setTimeout(() => {
          playSfx('cookDone', muted);
          setPhase('done');
        }, 280);
      }
      return next;
    });
  };

  const starRating = perfectHits >= 2 ? 3 : perfectHits === 1 ? 2 : 1;

  return (
    <div className="absolute inset-0 z-50 bg-amber-950/45 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-[360px] rounded-[32px] bg-white/95 backdrop-blur-xl border-2 border-white shadow-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-amber-900">
              {phase === 'select' && '🍳 Stove Cooking Menu'}
              {phase === 'prep' && `🔪 Step 1/3: Prep ${selectedRecipe.name}`}
              {phase === 'fry' && `🔥 Step 2/3: Sizzle & Flip!`}
              {phase === 'plate' && `✨ Step 3/3: Garnish & Plate!`}
              {phase === 'done' && `🔔 Order Up! ${selectedRecipe.name}`}
            </h3>
            <p className="text-[10px] font-bold text-amber-700">
              {phase === 'select' && 'Pick a homemade dish to cook for your pet!'}
              {phase === 'prep' && `${prepConfig.prepAction} (${prepIndex}/${prepConfig.ingredients.length})`}
              {phase === 'fry' && `Flip in the green golden zone! (${flipCount}/3 flips)`}
              {phase === 'plate' && 'Tap the 3 sparkling spots to add garnish!'}
              {phase === 'done' && 'Freshly cooked and ready in your Dining Table Food UI!'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full bg-gray-100 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {phase === 'select' && (
          <div className="grid grid-cols-2 gap-2">
            {COOKING_RECIPES.map((rec) => {
              const canAfford = coins >= rec.ingredientCost;
              return (
                <button
                  key={rec.id}
                  disabled={!canAfford}
                  onClick={() => handleSelectRecipe(rec)}
                  className={`p-3 rounded-2xl border-2 text-left space-y-1 transition active:scale-95 ${
                    canAfford
                      ? 'bg-amber-50/90 hover:bg-amber-100 border-amber-200'
                      : 'bg-gray-100 border-gray-200 opacity-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">{rec.emoji}</span>
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-lg bg-white text-amber-800 border border-amber-200">
                      {rec.ingredientCost}🪙
                    </span>
                  </div>
                  <div className="text-xs font-black text-gray-800">{rec.name}</div>
                  <div className="text-[9px] font-bold text-orange-700">
                    +{rec.hunger} Food • +{rec.happiness} Joy
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {phase === 'prep' && prepConfig && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2">
              {prepConfig.ingredients.map((ing, i) => (
                <div
                  key={i}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl border-2 transition ${
                    i < prepIndex
                      ? 'bg-emerald-100 border-emerald-400 scale-90 opacity-60'
                      : i === prepIndex
                      ? 'bg-amber-100 border-amber-400 scale-110 shadow-sm'
                      : 'bg-gray-50 border-gray-200 opacity-50'
                  }`}
                >
                  {i < prepIndex ? '✅' : ing}
                </div>
              ))}
            </div>

            <button
              onClick={handlePrepTap}
              className="relative w-full h-40 rounded-3xl bg-gradient-to-b from-amber-100 to-orange-100 border-4 border-amber-300 flex flex-col items-center justify-center overflow-hidden active:scale-95 transition cursor-pointer"
            >
              <span className="text-6xl drop-shadow-sm animate-bounce">
                {prepConfig.ingredients[prepIndex]}
              </span>
              <span className="mt-2 px-3 py-1 rounded-full bg-white/90 text-xs font-black text-amber-900 shadow-xs">
                Tap to Prep! 🔪
              </span>
              {prepParticles.map((p) => (
                <span
                  key={p.id}
                  style={{ left: `${p.x}%`, top: '42%' }}
                  className="absolute text-2xl pet-bubble pointer-events-none"
                >
                  {p.emoji}
                </span>
              ))}
            </button>
          </div>
        )}

        {phase === 'fry' && selectedRecipe && (
          <div className="space-y-3.5 py-1">
            <div className="relative h-40 rounded-3xl bg-gradient-to-b from-orange-100 via-amber-50 to-orange-100 border-2 border-amber-200 flex flex-col items-center justify-center overflow-hidden">
              <span className="absolute top-3 left-14 text-lg opacity-70 pet-bubble">💨</span>
              <span className="absolute top-5 right-14 text-lg opacity-70 pet-bubble">💨</span>

              <div
                className="text-6xl transition-all duration-300"
                style={{
                  transform: isFlipping
                    ? 'translateY(-36px) rotate(360deg) scale(1.18)'
                    : 'translateY(0px) rotate(0deg) scale(1)',
                }}
              >
                {selectedRecipe.emoji}
              </div>

              <div className="flex items-center mt-1">
                <div className="w-32 h-3.5 rounded-b-xl rounded-t-xs bg-gray-800 shadow-md" />
                <div className="w-10 h-2 bg-gray-600 rounded-r-full -ml-1" />
              </div>

              <div className="flex gap-2 mt-1 text-sm">
                <span className="pet-twinkle">🔥</span>
                <span className="pet-nibble">🔥</span>
                <span className="pet-twinkle">🔥</span>
              </div>

              {feedback && (
                <span className="absolute top-2 px-3 py-0.5 rounded-full bg-white/95 text-[11px] font-black text-orange-600 shadow-sm">
                  {feedback}
                </span>
              )}
            </div>

            <div className="space-y-2">
              <div className="relative h-7 rounded-full bg-amber-100 border-2 border-amber-300 overflow-hidden shadow-inner">
                <div
                  className="absolute inset-y-0 bg-amber-300/60"
                  style={{ left: '26%', width: '48%' }}
                />
                <div
                  className="absolute inset-y-0 bg-emerald-400/85 border-x-2 border-emerald-600"
                  style={{ left: '38%', width: '24%' }}
                />
                <div
                  className="absolute top-0.5 bottom-0.5 w-3.5 -ml-1.5 rounded-full bg-rose-500 border-2 border-white shadow-md"
                  style={{ left: `${cursor}%` }}
                />
              </div>
              <button
                onClick={handleFlipTap}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-sm shadow-md active:scale-95 transition"
              >
                🍳 Flip Pan Now! ({flipCount + 1}/3)
              </button>
            </div>
          </div>
        )}

        {phase === 'plate' && selectedRecipe && prepConfig && (
          <div className="space-y-2">
            <div className="relative h-44 rounded-3xl bg-gradient-to-b from-rose-50 to-amber-50 border-2 border-rose-200 flex items-center justify-center overflow-hidden">
              <div className="w-36 h-36 rounded-full bg-white border-4 border-amber-200 shadow-inner flex items-center justify-center">
                <span className="text-6xl">{selectedRecipe.emoji}</span>
              </div>

              {garnishes.map((g) => (
                <button
                  key={g.id}
                  disabled={g.placed}
                  onClick={() => handlePlaceGarnish(g.id)}
                  style={{ left: `${g.x}%`, top: `${g.y}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-2xl transition active:scale-75 ${
                    g.placed
                      ? 'bg-transparent scale-110'
                      : 'bg-amber-200/80 border-2 border-dashed border-amber-500 animate-pulse'
                  }`}
                >
                  {g.placed ? prepConfig.garnish : '✨'}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-center font-bold text-rose-600">
              Tap all 3 ✨ sparkles to garnish your dish!
            </p>
          </div>
        )}

        {phase === 'done' && selectedRecipe && (
          <div className="text-center py-3 space-y-3">
            <div className="relative inline-block">
              <div className="text-6xl animate-bounce">{selectedRecipe.emoji}</div>
              <span className="absolute -top-2 -right-4 text-2xl pet-twinkle">✨</span>
            </div>
            <div className="flex justify-center gap-1 text-2xl">
              {[1, 2, 3].map((s) => (
                <span key={s} className={s <= starRating ? 'opacity-100 scale-110' : 'opacity-25'}>
                  ⭐
                </span>
              ))}
            </div>
            <div>
              <div className="text-base font-black text-gray-800">{selectedRecipe.name} Ready!</div>
              <p className="text-xs font-bold text-amber-700">
                {starRating === 3
                  ? '👨‍🍳 3-Star Master Chef Dish! (+10🪙 tip!)'
                  : starRating === 2
                  ? '✨ 2-Star Delicious Homemade Meal!'
                  : '💛 Warm & Cozy Homemade Meal!'}
              </p>
            </div>
            <button
              onClick={() => onCompleteCook(selectedRecipe, starRating === 3 ? 10 : 0)}
              className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black text-sm shadow-md active:scale-95 transition"
            >
              Put in Food Menu 🍽️
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN APPLICATION
// ============================================================================
export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem(USER_STORAGE_KEY);
      if (savedUser === 'Ronald' || savedUser === 'Ulfah') return savedUser;
    } catch {
      // Ignore storage access errors
    }
    return null;
  });

  const handleSelectUser = useCallback((user) => {
    setCurrentUser(user);
    try {
      if (user) {
        localStorage.setItem(USER_STORAGE_KEY, user);
      } else {
        localStorage.removeItem(USER_STORAGE_KEY);
      }
    } catch {
      // Ignore storage access errors
    }
  }, []);

  const [world, setWorld] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.pets && Object.keys(parsed.pets).length > 0) return parsed;
      }
    } catch {
      // Fall back to fresh initial world
    }
    return createInitialWorld();
  });

  const [cloudStatus, setCloudStatus] = useState(db ? 'connecting' : 'local');
  const [now, setNow] = useState(Date.now());
  const [activeTab, setActiveTab] = useState('home');
  const [currentRoom, setCurrentRoom] = useState('living');
  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState(null);

  // Room & Pet Movement State
  const [petPos, setPetPos] = useState({ x: 50, y: 66 });
  const [petFacing, setPetFacing] = useState(1);
  const [isWalking, setIsWalking] = useState(false);
  const [isEating, setIsEating] = useState(false);
  const [isHappy, setIsHappy] = useState(false);
  const [isSittingAtTable, setIsSittingAtTable] = useState(false);
  const [isPetOnBed, setIsPetOnBed] = useState(false);
  const [isPooping, setIsPooping] = useState(false);
  const [droppedItem, setDroppedItem] = useState(null);
  const [floatingHearts, setFloatingHearts] = useState([]);

  // UI Overlays & Modals
  const [showFoodDrawer, setShowFoodDrawer] = useState(false);
  const [showBathGame, setShowBathGame] = useState(false);
  const [showCookModal, setShowCookModal] = useState(false);
  const [wardrobeCategory, setWardrobeCategory] = useState('hat');
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [gachaRolling, setGachaRolling] = useState(false);
  const [gachaResult, setGachaResult] = useState(null);
  const [activeMinigame, setActiveMinigame] = useState(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showRoomHints, setShowRoomHints] = useState(true);
  const [activeNeedAlert, setActiveNeedAlert] = useState(null);

  // Collapsible Music Player State (minimizes to logo after 3s idle)
  const [playlist, setPlaylist] = useState(DEFAULT_PLAYLIST);
  const [trackIndex, setTrackIndex] = useState(0);
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  const [musicExpanded, setMusicExpanded] = useState(false);
  const audioRef = useRef(null);
  const musicIdleTimerRef = useRef(null);

  // Auto-minimizing Pet Status Card (minimizes after 5s idle, expands when clicking pet)
  const [statusExpanded, setStatusExpanded] = useState(true);
  const statusIdleTimerRef = useRef(null);

  const walkTimeoutRef = useRef(null);
  const notifiedNeedsRef = useRef({});
  const lastRemoteRevRef = useRef(0);
  const lastCareEventIdRef = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 2800);
  }, []);

  const resetStatusIdleTimer = useCallback(() => {
    if (statusIdleTimerRef.current) clearTimeout(statusIdleTimerRef.current);
    statusIdleTimerRef.current = setTimeout(() => {
      setStatusExpanded(false);
    }, 5000);
  }, []);

  const expandStatusCard = useCallback(() => {
    setStatusExpanded(true);
    resetStatusIdleTimer();
  }, [resetStatusIdleTimer]);

  // Start 5s auto-minimize timer once signed in on Home tab
  useEffect(() => {
    if (!currentUser || activeTab !== 'home') return;
    resetStatusIdleTimer();
    return () => {
      if (statusIdleTimerRef.current) clearTimeout(statusIdleTimerRef.current);
    };
  }, [currentUser, activeTab, resetStatusIdleTimer]);

  // Helper to send cute & fun notifications to both Ronald & Ulfah
  const triggerCutePartnerNotification = useCallback(
    (title, body) => {
      showToast(`${title} ${body}`);
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(title, { body });
        } catch {
          // Ignore browser notification restrictions
        }
      }
    },
    [showToast]
  );

  // Live Jakarta Time & Sky Lighting State
  const jakartaTime = useMemo(() => getJakartaTimeInfo(now), [now]);

  // Load custom song list from public/music/tracks.json if present on GitHub/Vercel
  useEffect(() => {
    fetch('/music/tracks.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setPlaylist(
            data.map((item, idx) =>
              typeof item === 'string'
                ? {
                    id: `custom_${idx}`,
                    title: item.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
                    file: item.startsWith('/') ? item : `/music/${item}`,
                  }
                : {
                    id: item.id || `custom_${idx}`,
                    title: item.title || `Track ${idx + 1}`,
                    file: item.file?.startsWith('/') ? item.file : `/music/${item.file}`,
                  }
            )
          );
        }
      })
      .catch(() => {});
  }, []);

  const resetMusicIdleTimer = useCallback(() => {
    if (musicIdleTimerRef.current) clearTimeout(musicIdleTimerRef.current);
    musicIdleTimerRef.current = setTimeout(() => {
      setMusicExpanded(false);
    }, 3000);
  }, []);

  const handleOpenMusicPlayer = useCallback(() => {
    setMusicExpanded(true);
    resetMusicIdleTimer();
  }, [resetMusicIdleTimer]);

  const handleTogglePlayPause = useCallback(() => {
    resetMusicIdleTimer();
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlayingMusic) {
      audio.pause();
      setIsPlayingMusic(false);
    } else {
      audio
        .play()
        .then(() => setIsPlayingMusic(true))
        .catch(() => {
          setIsPlayingMusic(false);
          showToast('Add MP3 files into public/music/ to play!');
        });
    }
  }, [isPlayingMusic, resetMusicIdleTimer, showToast]);

  const handleSkipTrack = useCallback(() => {
    resetMusicIdleTimer();
    if (playlist.length === 0) return;
    const nextIdx = (trackIndex + 1) % playlist.length;
    setTrackIndex(nextIdx);
    setTimeout(() => {
      const audio = audioRef.current;
      if (audio) {
        audio
          .play()
          .then(() => setIsPlayingMusic(true))
          .catch(() => setIsPlayingMusic(false));
      }
    }, 60);
  }, [playlist.length, resetMusicIdleTimer, trackIndex]);

  const handleStopMusic = useCallback(() => {
    resetMusicIdleTimer();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setIsPlayingMusic(false);
  }, [resetMusicIdleTimer]);

  useEffect(() => {
    return () => {
      if (musicIdleTimerRef.current) clearTimeout(musicIdleTimerRef.current);
    };
  }, []);

  // Subscribe to real-time Firestore updates across Ronald & Ulfah's devices
  useEffect(() => {
    if (!db) return;
    const roomDocRef = doc(db, 'shared_pet_rooms', SHARED_COUPLE_ROOM_ID);
    const unsubscribe = onSnapshot(
      roomDocRef,
      (snap) => {
        setCloudStatus('live');
        if (snap.exists()) {
          const remoteData = snap.data();
          if (remoteData && remoteData.pets && Object.keys(remoteData.pets).length > 0) {
            const remoteRev = remoteData._rev || 0;
            if (remoteRev > lastRemoteRevRef.current) {
              lastRemoteRevRef.current = remoteRev;
              setWorld(remoteData);
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteData));
              } catch {
                // Ignore storage write errors
              }
              // Fire cute notification if partner just fed, bathed, or tucked pets into bed
              const careEvt = remoteData.lastCareEvent;
              if (careEvt && careEvt.id && careEvt.id !== lastCareEventIdRef.current) {
                lastCareEventIdRef.current = careEvt.id;
                if (Date.now() - (careEvt.timestamp || 0) < 30000) {
                  playSfx('cuddle', muted);
                  triggerCutePartnerNotification(careEvt.title, careEvt.body);
                }
              }
            }
          }
        } else {
          // Seed initial shared room if cloud doc doesn't exist yet
          const seeded = { ...createInitialWorld(), _rev: Date.now() };
          lastRemoteRevRef.current = seeded._rev;
          setDoc(roomDocRef, seeded).catch(() => {});
        }
      },
      () => {
        setCloudStatus('offline');
      }
    );
    return () => unsubscribe();
  }, [muted, triggerCutePartnerNotification]);

  // Request browser notification permission once signed in
  useEffect(() => {
    if (!currentUser || typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, [currentUser]);

  // Briefly display interactive furniture hints for 1.5s whenever entering a room
  useEffect(() => {
    if (!currentUser || activeTab !== 'home') return;
    setShowRoomHints(true);
    const timer = setTimeout(() => {
      setShowRoomHints(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, [currentUser, currentRoom, activeTab]);

  const updateWorld = useCallback((updater) => {
    setWorld((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const rev = Date.now() + Math.random();
      const stamped = { ...next, _rev: rev };
      lastRemoteRevRef.current = rev;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stamped));
      } catch {
        // Ignore storage write errors
      }
      if (db) {
        const roomDocRef = doc(db, 'shared_pet_rooms', SHARED_COUPLE_ROOM_ID);
        setDoc(roomDocRef, stamped).catch(() => {});
      }
      return stamped;
    });
  }, []);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setWorld(JSON.parse(e.newValue));
        } catch {
          // Ignore malformed storage
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Real-time aging, Jakarta clock & stat tick
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(id);
  }, []);

  const activePet = useMemo(() => {
    return world.pets[world.activePetId] || Object.values(world.pets)[0];
  }, [world]);

  const companionPets = useMemo(() => {
    return Object.values(world.pets || {}).filter((p) => p.id !== activePet.id);
  }, [world.pets, activePet.id]);

  const ageMs = Math.max(60000, now - (activePet.adoptedAt || now));
  const growthInfo = useMemo(() => getGrowthStage(ageMs), [ageMs]);
  const isRonald = currentUser === 'Ronald';
  const canClaimDaily = world.lastDailyClaim !== getTodayKey();

  const liveStats = useMemo(() => {
    const elapsedMins = Math.max(0, (now - (activePet.lastUpdated || now)) / 60000);
    const hunger = clamp(Math.round(activePet.hunger - elapsedMins * 0.45));
    const happiness = clamp(Math.round(activePet.happiness - elapsedMins * 0.35));
    const hygiene = clamp(Math.round(activePet.hygiene - elapsedMins * 0.3));
    const energy = activePet.isSleeping
      ? clamp(Math.round(activePet.energy + elapsedMins * 1.6))
      : clamp(Math.round(activePet.energy - elapsedMins * 0.4));
    const potty = clamp(Math.round((activePet.potty ?? 0) + elapsedMins * 0.4));
    return { hunger, happiness, energy, hygiene, potty };
  }, [activePet, now]);

  const needsPoop = liveStats.potty >= 60;

  const movePetTo = useCallback((x, y, durationMs = 850) => {
    setPetPos((prev) => {
      if (Math.abs(x - prev.x) > 1.5) {
        setPetFacing(x >= prev.x ? 1 : -1);
      }
      return { x, y };
    });
    setIsWalking(true);
    if (walkTimeoutRef.current) clearTimeout(walkTimeoutRef.current);
    walkTimeoutRef.current = setTimeout(() => {
      setIsWalking(false);
    }, durationMs);
  }, []);

  // Auto-wake check based on Jakarta schedule (05:00-06:00 WIB for night sleep, 15m for naps)
  useEffect(() => {
    const petsList = Object.values(world.pets || {});
    const dueToWake = petsList.some((p) => p.isSleeping && p.wakeAt && now >= p.wakeAt);
    if (!dueToWake) return;

    const firstPet = petsList.find((p) => p.isSleeping) || Object.values(world.pets)[0];
    const petCount = petsList.length;
    setIsPetOnBed(false);
    movePetTo(48, 66, 750);

    updateWorld((prev) => {
      const nextPets = {};
      Object.entries(prev.pets).forEach(([pid, pet]) => {
        nextPets[pid] = {
          ...pet,
          isSleeping: false,
          wakeAt: null,
          energy: clamp((pet.energy ?? 80) + 18),
          lastUpdated: Date.now(),
        };
      });
      return {
        ...prev,
        pets: nextPets,
        activities: [
          {
            id: Math.random().toString(36).slice(2),
            actor: petCount > 1 ? 'Your pets' : firstPet.name,
            text: 'stretched their paws and woke up refreshed! ☀️',
            emoji: '☀️',
            timestamp: Date.now(),
          },
          ...(prev.activities || []),
        ].slice(0, 40),
      };
    });

    triggerCutePartnerNotification(
      `☀️ Rise & Shine!`,
      petCount > 1
        ? `All your pets just woke up full of energy!`
        : `${firstPet.name} just woke up full of energy!`
    );
  }, [now, world.pets, movePetTo, triggerCutePartnerNotification, updateWorld]);

  // Commit pet updates + activity log + cute couple care notification
  const commitPetUpdate = useCallback(
    (mutatePet, coinDelta = 0, logText = null, emoji = '✨', applyToAll = false, careNotif = null) => {
      const careEventObj = careNotif
        ? {
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            actor: currentUser || 'Ronald & Ulfah',
            title: careNotif.title,
            body: careNotif.body,
            timestamp: Date.now(),
          }
        : null;

      if (careEventObj) {
        lastCareEventIdRef.current = careEventObj.id;
      }

      updateWorld((prev) => {
        const nextPets = { ...prev.pets };
        const targetIds = applyToAll ? Object.keys(prev.pets) : [prev.activePetId];

        targetIds.forEach((pid) => {
          const pet = prev.pets[pid];
          if (!pet) return;
          const isPrimary = pid === prev.activePetId;
          const basePet = {
            ...pet,
            hunger: isPrimary ? liveStats.hunger : pet.hunger,
            happiness: isPrimary ? liveStats.happiness : pet.happiness,
            energy: isPrimary ? liveStats.energy : pet.energy,
            hygiene: isPrimary ? liveStats.hygiene : pet.hygiene,
            potty: isPrimary ? liveStats.potty : (pet.potty ?? 0),
          };
          nextPets[pid] = {
            ...basePet,
            ...(mutatePet ? mutatePet(basePet) : {}),
            lastUpdated: Date.now(),
          };
        });

        const nextActivities = logText
          ? [
              {
                id: Math.random().toString(36).slice(2),
                actor: currentUser || 'Ronald & Ulfah',
                text: logText,
                emoji,
                timestamp: Date.now(),
              },
              ...(prev.activities || []),
            ].slice(0, 40)
          : prev.activities || [];

        return {
          ...prev,
          coins: Math.max(0, prev.coins + coinDelta),
          pets: nextPets,
          activities: nextActivities,
          ...(careEventObj ? { lastCareEvent: careEventObj } : {}),
        };
      });

      if (careEventObj) {
        triggerCutePartnerNotification(careEventObj.title, careEventObj.body);
      }
    },
    [currentUser, liveStats, triggerCutePartnerNotification, updateWorld]
  );

  // Monitor Hungry, Sleepy, Bath, and Bored states & fire notifications
  useEffect(() => {
    if (!currentUser) return;
    if (activePet.isSleeping) {
      setActiveNeedAlert(null);
      return;
    }

    const needsList = [
      {
        key: 'hungry',
        isLow: liveStats.hunger <= 30,
        emoji: '🍓',
        title: `${activePet.name} is Hungry!`,
        desc: 'Tap to head to the Dining Room for a yummy snack',
        actionLabel: 'Feed',
        onAction: () => {
          setActiveTab('home');
          setCurrentRoom('dining');
          setShowFoodDrawer(true);
          setIsSittingAtTable(true);
          movePetTo(22, 54, 650);
        },
      },
      {
        key: 'sleepy',
        isLow: liveStats.energy <= 25,
        emoji: '🌙',
        title: `${activePet.name} is Sleepy!`,
        desc: 'Tap to go to the Bedroom and tuck into bed',
        actionLabel: 'Bedtime',
        onAction: () => {
          setActiveTab('home');
          setCurrentRoom('bedroom');
          movePetTo(18, 44, 750);
          setIsPetOnBed(true);
        },
      },
      {
        key: 'bath',
        isLow: liveStats.hygiene <= 30,
        emoji: '🫧',
        title: `${activePet.name} Needs a Bath!`,
        desc: 'Tap to scrub and rinse in the Spa Bathroom',
        actionLabel: 'Bathe',
        onAction: () => {
          setActiveTab('home');
          setCurrentRoom('bathroom');
          setIsPetOnBed(false);
          setShowBathGame(true);
        },
      },
      {
        key: 'bored',
        isLow: liveStats.happiness <= 30,
        emoji: '🎮',
        title: `${activePet.name} is Bored!`,
        desc: 'Tap to play a fun minigame in the Couple Arcade',
        actionLabel: 'Play',
        onAction: () => {
          setActiveTab('arcade');
        },
      },
    ];

    const urgentNeed = needsList.find((n) => n.isLow) || null;
    setActiveNeedAlert(urgentNeed);

    const nowTs = Date.now();
    needsList.forEach((n) => {
      if (n.isLow) {
        const lastSent = notifiedNeedsRef.current[n.key] || 0;
        if (nowTs - lastSent > 180000) {
          notifiedNeedsRef.current[n.key] = nowTs;
          playSfx('cuddle', muted);
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(`${n.emoji} ${n.title}`, { body: n.desc });
            } catch {
              // Ignore browser notification restrictions
            }
          }
        }
      } else {
        delete notifiedNeedsRef.current[n.key];
      }
    });
  }, [currentUser, activePet.isSleeping, activePet.name, liveStats.hunger, liveStats.energy, liveStats.hygiene, liveStats.happiness, muted, movePetTo]);

  // Autonomous room wandering when awake on Home tab
  useEffect(() => {
    if (!currentUser || activeTab !== 'home' || activePet.isSleeping || droppedItem || isPetOnBed || isPooping || isSittingAtTable) return;
    const wander = setInterval(() => {
      const nx = 20 + Math.random() * 54;
      const ny = 56 + Math.random() * 20;
      movePetTo(nx, ny, 1000);
    }, 4500);
    return () => clearInterval(wander);
  }, [currentUser, activeTab, activePet.isSleeping, droppedItem, isPetOnBed, isPooping, isSittingAtTable, movePetTo]);

  // Helper to close food drawer & return pets from dining chairs to normal floor
  const handleCloseFoodDrawer = useCallback(() => {
    setShowFoodDrawer(false);
    if (isSittingAtTable) {
      setIsSittingAtTable(false);
      movePetTo(48, 68, 750);
    }
  }, [isSittingAtTable, movePetTo]);

  // Interactions
  const handleStageTap = (e) => {
    if (activeTab !== 'home' || activePet.isSleeping || isPooping) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = clamp(((e.clientX - rect.left) / rect.width) * 100, 14, 86);
    const y = clamp(((e.clientY - rect.top) / rect.height) * 100, 48, 78);
    setIsPetOnBed(false);
    if (isSittingAtTable) {
      setIsSittingAtTable(false);
      setShowFoodDrawer(false);
    }
    movePetTo(x, y, 850);
  };

  const handleCuddlePet = (e) => {
    e.stopPropagation();
    expandStatusCard();
    if (activePet.isSleeping) {
      const wakeStr = activePet.wakeAt ? ` (wakes ~${formatWakeTimeWIB(activePet.wakeAt)} WIB)` : '';
      showToast(`${activePet.name} is dreaming sweetly... 💤${wakeStr}`);
      return;
    }
    playSfx('cuddle', muted);
    setIsHappy(true);
    setTimeout(() => setIsHappy(false), 950);
    const id = Date.now() + Math.random();
    setFloatingHearts((prev) => [...prev.slice(-4), { id, x: petPos.x, y: petPos.y - 10 }]);
    setTimeout(() => setFloatingHearts((prev) => prev.filter((h) => h.id !== id)), 1100);
    commitPetUpdate(
      () => ({ happiness: clamp(liveStats.happiness + 8) }),
      0,
      `gave ${activePet.name} warm cuddles!`,
      '💖'
    );
  };

  const handleFeedPet = (food) => {
    if (activePet.isSleeping) {
      showToast(`Wake your pets up before feeding!`);
      return;
    }
    if (world.coins < food.cost) {
      showToast('Not enough coins! Play in Games to earn more.');
      return;
    }
    const petCount = Object.keys(world.pets).length;
    playSfx('eat', muted);
    setShowFoodDrawer(false);
    setCurrentRoom('dining');
    setIsSittingAtTable(true);
    movePetTo(22, 54, 550);
    setPetFacing(1);
    setDroppedItem({ emoji: food.emoji, x: 50, y: 54 });

    setTimeout(() => {
      setIsEating(true);
      setTimeout(() => {
        setIsEating(false);
        setDroppedItem(null);
        setIsHappy(true);
        setTimeout(() => {
          setIsHappy(false);
          setIsSittingAtTable(false);
          movePetTo(48, 68, 750);
        }, 700);
      }, 1100);
    }, 520);

    const cuteFeedNotif = {
      title: `${food.emoji} Yummy Snack Time!`,
      body:
        petCount > 1
          ? `${currentUser} fed all the babies ${food.name}! Nom nom nom~ 💕`
          : `${currentUser} fed ${activePet.name} a yummy ${food.name}! Nom nom~ 💕`,
    };

    commitPetUpdate(
      (p) => ({
        hunger: clamp(p.hunger + food.hunger),
        happiness: clamp(p.happiness + food.happiness),
        potty: clamp((p.potty ?? 0) + 28),
      }),
      -food.cost,
      petCount > 1
        ? `fed all pets ${food.name} ${food.emoji} at the dining table!`
        : `fed ${activePet.name} ${food.name} ${food.emoji}`,
      food.emoji,
      true,
      cuteFeedNotif
    );
  };

  const handleFeedCooked = (recipe) => {
    if (activePet.isSleeping) {
      showToast(`Wake your pets up before feeding!`);
      return;
    }
    const count = world.cookedInventory?.[recipe.id] || 0;
    if (count <= 0) return;

    const petCount = Object.keys(world.pets).length;
    playSfx('eat', muted);
    setShowFoodDrawer(false);
    setCurrentRoom('dining');
    setIsSittingAtTable(true);
    movePetTo(22, 54, 550);
    setPetFacing(1);
    setDroppedItem({ emoji: recipe.emoji, x: 50, y: 54 });

    setTimeout(() => {
      setIsEating(true);
      setTimeout(() => {
        setIsEating(false);
        setDroppedItem(null);
        setIsHappy(true);
        setTimeout(() => {
          setIsHappy(false);
          setIsSittingAtTable(false);
          movePetTo(48, 68, 750);
        }, 700);
      }, 1100);
    }, 520);

    const cuteCookedNotif = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      actor: currentUser,
      title: `👨‍🍳 Chef ${currentUser} Served Dinner!`,
      body:
        petCount > 1
          ? `${currentUser} served homemade ${recipe.name} ${recipe.emoji} to all pets! So spoilt~ 💖`
          : `${currentUser} served homemade ${recipe.name} ${recipe.emoji} to ${activePet.name}! 💖`,
      timestamp: Date.now(),
    };
    lastCareEventIdRef.current = cuteCookedNotif.id;

    updateWorld((prev) => {
      const nextCount = Math.max(0, (prev.cookedInventory?.[recipe.id] || 0) - 1);
      const nextPets = {};
      Object.entries(prev.pets).forEach(([pid, pet]) => {
        const isPrimary = pid === prev.activePetId;
        const baseHunger = isPrimary ? liveStats.hunger : pet.hunger;
        const baseHappiness = isPrimary ? liveStats.happiness : pet.happiness;
        const baseEnergy = isPrimary ? liveStats.energy : pet.energy;
        const baseHygiene = isPrimary ? liveStats.hygiene : pet.hygiene;
        const basePotty = isPrimary ? liveStats.potty : (pet.potty ?? 0);
        nextPets[pid] = {
          ...pet,
          hunger: clamp(baseHunger + recipe.hunger),
          happiness: clamp(baseHappiness + recipe.happiness),
          energy: baseEnergy,
          hygiene: baseHygiene,
          potty: clamp(basePotty + 32),
          lastUpdated: Date.now(),
        };
      });
      return {
        ...prev,
        cookedInventory: { ...(prev.cookedInventory || {}), [recipe.id]: nextCount },
        pets: nextPets,
        lastCareEvent: cuteCookedNotif,
        activities: [
          {
            id: Math.random().toString(36).slice(2),
            actor: currentUser,
            text:
              petCount > 1
                ? `served homemade ${recipe.name} ${recipe.emoji} to all pets!`
                : `served homemade ${recipe.name} ${recipe.emoji} to ${activePet.name}!`,
            emoji: recipe.emoji,
            timestamp: Date.now(),
          },
          ...(prev.activities || []),
        ].slice(0, 40),
      };
    });
    triggerCutePartnerNotification(cuteCookedNotif.title, cuteCookedNotif.body);
  };

  const handleToggleSleep = () => {
    const nextSleep = !activePet.isSleeping;
    const petCount = Object.keys(world.pets).length;
    playSfx('sleep', muted);
    const wakeAtMs = nextSleep ? computeJakartaWakeAt(Date.now()) : null;
    const wakeFormatted = wakeAtMs ? formatWakeTimeWIB(wakeAtMs) : '';
    const isNightSleep = jakartaTime.hour >= 20 || jakartaTime.hour < 4;

    if (nextSleep) {
      setCurrentRoom('bedroom');
      setIsPetOnBed(true);
    } else {
      setIsPetOnBed(false);
      movePetTo(48, 66, 750);
    }

    const cuteSleepNotif = nextSleep
      ? {
          title: isNightSleep ? `🌙 Sweet Dreams, Babies!` : `😴 Cozy 15-Min Nap Time!`,
          body: isNightSleep
            ? `${currentUser} tucked ${petCount > 1 ? 'everyone' : activePet.name} into bed! Waking up at ${wakeFormatted} WIB 💤`
            : `${currentUser} put ${petCount > 1 ? 'everyone' : activePet.name} down for a 15m nap (wakes ${wakeFormatted} WIB) 🧸`,
        }
      : {
          title: `☀️ Good Morning Sunshine!`,
          body: `${currentUser} woke ${petCount > 1 ? 'all the pets' : activePet.name} up for cuddles!`,
        };

    commitPetUpdate(
      (p) => ({
        isSleeping: nextSleep,
        wakeAt: wakeAtMs,
        energy: nextSleep ? p.energy : clamp(p.energy + 12),
      }),
      0,
      nextSleep
        ? petCount > 1
          ? `tucked all pets into bed (wakes at ${wakeFormatted} WIB).`
          : `tucked ${activePet.name} into bed (wakes at ${wakeFormatted} WIB).`
        : petCount > 1
        ? `woke all pets up for a sunny new day!`
        : `woke ${activePet.name} up for a sunny new day!`,
      nextSleep ? '🌙' : '☀️',
      true,
      cuteSleepNotif
    );
  };

  const handleCompleteCook = (recipe, bonusCoins = 0) => {
    playSfx('coin', muted);
    setShowCookModal(false);
    setCurrentRoom('dining');
    setShowFoodDrawer(true);
    setIsSittingAtTable(true);
    setIsPetOnBed(false);
    movePetTo(22, 54, 700);
    setTimeout(() => setPetFacing(1), 650);

    updateWorld((prev) => ({
      ...prev,
      coins: Math.max(0, prev.coins - recipe.ingredientCost + bonusCoins),
      cookedInventory: {
        ...(prev.cookedInventory || {}),
        [recipe.id]: (prev.cookedInventory?.[recipe.id] || 0) + 1,
      },
      activities: [
        {
          id: Math.random().toString(36).slice(2),
          actor: currentUser,
          text: `cooked homemade ${recipe.name} ${recipe.emoji} on the stove!`,
          emoji: '🍳',
          timestamp: Date.now(),
        },
        ...(prev.activities || []),
      ].slice(0, 40),
    }));
    showToast(`${recipe.name} ${recipe.emoji} added to your Food Menu!`);
  };

  const handleToiletClick = () => {
    if (activeTab !== 'home' || isPooping) return;
    if (activePet.isSleeping) {
      showToast(`Wake ${activePet.name} up before potty time!`);
      return;
    }
    setIsPetOnBed(false);
    setIsPooping(true);
    movePetTo(16, 42, 700);

    setTimeout(() => {
      playSfx('flush', muted);
    }, 950);

    setTimeout(() => {
      setIsPooping(false);
      setIsHappy(true);
      movePetTo(46, 66, 750);
      setTimeout(() => setIsHappy(false), 900);
      commitPetUpdate(
        () => ({
          potty: 0,
          happiness: clamp(liveStats.happiness + 10),
        }),
        5,
        `helped ${activePet.name} use the toilet and flushed! (+5🪙)`,
        '🚽'
      );
      showToast(`${activePet.name} feels all better! +5🪙 🚽✨`);
    }, 1900);
  };

  const handleBedClick = (bedIndex = 0) => {
    if (activeTab !== 'home') return;
    playSfx('cuddle', muted);
    const petCount = Object.keys(world.pets).length;
    const targetX = petCount > 1 ? 18 : bedIndex === 0 ? 18 : 48;
    const targetY = 44;
    movePetTo(targetX, targetY, 750);
    setIsPetOnBed(true);
    if (!activePet.isSleeping) {
      showToast(
        petCount > 1
          ? `Everyone hopped into the twin beds! Tap the lamp to sleep 💡`
          : `${activePet.name} hopped on the bed! Tap the lamp to sleep 💡`
      );
    }
  };

  const handleLampClick = () => {
    if (activeTab !== 'home') return;
    if (activePet.isSleeping) {
      handleToggleSleep();
      return;
    }
    if (isPetOnBed) {
      handleToggleSleep();
    } else {
      showToast(`Tap a bed to put ${activePet.name} on the bed first! 🛏️`);
    }
  };

  const handleBubbleBath = () => {
    if (activePet.isSleeping) {
      showToast(`Wake ${activePet.name} up before bath time!`);
      return;
    }
    setCurrentRoom('bathroom');
    setIsPetOnBed(false);
    setShowBathGame(true);
  };

  const handleCompleteBath = () => {
    playSfx('coin', muted);
    setShowBathGame(false);
    movePetTo(64, 66, 750);
    const cuteBathNotif = {
      title: `🫧 Squeaky Clean & Fluffy!`,
      body: `${currentUser} gave ${activePet.name} a bubbly spa bath! Smells like strawberries~ ✨`,
    };
    commitPetUpdate(
      () => ({ hygiene: 100, happiness: clamp(liveStats.happiness + 14) }),
      10,
      `scrubbed & rinsed ${activePet.name} in a bubble bath! (+10🪙)`,
      '🫧',
      false,
      cuteBathNotif
    );
  };

  const handleBuyOrEquipOutfit = (item) => {
    const owned = (world.ownedOutfits || []).includes(item.id);
    const currentOutfit = activePet.outfit || { hat: null, shirt: null, costume: null };
    const isEquipped = currentOutfit[item.slot] === item.id;

    if (owned) {
      playSfx('cuddle', muted);
      const nextSlotVal = isEquipped ? null : item.id;
      commitPetUpdate(
        (p) => {
          const prevOut = p.outfit || { hat: null, shirt: null, costume: null };
          const updated = { ...prevOut, [item.slot]: nextSlotVal };
          if (item.slot === 'costume' && nextSlotVal) {
            updated.shirt = null;
          } else if (item.slot === 'shirt' && nextSlotVal) {
            updated.costume = null;
          }
          return { outfit: updated };
        },
        0,
        isEquipped ? `took ${item.name} off ${activePet.name}.` : `dressed ${activePet.name} in ${item.name} ${item.emoji}!`,
        item.emoji
      );
      showToast(isEquipped ? `Removed ${item.name}` : `Equipped ${item.name}! ${item.emoji}`);
      return;
    }

    if (world.coins < item.cost) {
      showToast(`Need ${item.cost}🪙 to buy ${item.name}!`);
      return;
    }

    playSfx('coin', muted);
    updateWorld((prev) => {
      const pet = prev.pets[prev.activePetId];
      const prevOut = pet?.outfit || { hat: null, shirt: null, costume: null };
      const updated = { ...prevOut, [item.slot]: item.id };
      if (item.slot === 'costume') updated.shirt = null;
      if (item.slot === 'shirt') updated.costume = null;

      return {
        ...prev,
        coins: prev.coins - item.cost,
        ownedOutfits: [...(prev.ownedOutfits || []), item.id],
        pets: {
          ...prev.pets,
          [prev.activePetId]: {
            ...pet,
            outfit: updated,
            happiness: clamp((pet?.happiness ?? 80) + 10),
            lastUpdated: Date.now(),
          },
        },
        activities: [
          {
            id: Math.random().toString(36).slice(2),
            actor: currentUser,
            text: `bought ${item.name} ${item.emoji} for ${activePet.name} (-${item.cost}🪙)!`,
            emoji: item.emoji,
            timestamp: Date.now(),
          },
          ...(prev.activities || []),
        ].slice(0, 40),
      };
    });
    showToast(`Bought & equipped ${item.name}! ${item.emoji}`);
  };

  const handleParkFetch = () => {
    if (activePet.isSleeping) {
      showToast(`Wake ${activePet.name} up to play at the park!`);
      return;
    }
    playSfx('coin', muted);
    setCurrentRoom('park');
    setIsPetOnBed(false);
    const ballX = 24 + Math.random() * 50;
    const ballY = 64 + Math.random() * 14;
    setDroppedItem({ emoji: '🎾', x: ballX, y: ballY });
    movePetTo(ballX, ballY, 850);
    setTimeout(() => setDroppedItem(null), 1300);

    commitPetUpdate(
      () => ({
        happiness: clamp(liveStats.happiness + 15),
        energy: clamp(liveStats.energy - 8),
        hunger: clamp(liveStats.hunger - 5),
      }),
      8,
      `played fetch with ${activePet.name} at Pet Park (+8🪙)!`,
      '🎾'
    );
    showToast(`${activePet.name} caught the ball! +8🪙`);
  };

  const handleClaimDailyBonus = () => {
    if (!canClaimDaily) return;
    playSfx('coin', muted);
    const today = getTodayKey();
    updateWorld((prev) => ({
      ...prev,
      coins: prev.coins + DAILY_BONUS_COINS,
      streak: (prev.streak || 0) + 1,
      lastDailyClaim: today,
      activities: [
        {
          id: Math.random().toString(36).slice(2),
          actor: currentUser,
          text: `claimed the Daily Couple Bonus (+${DAILY_BONUS_COINS}🪙)!`,
          emoji: '🎁',
          timestamp: Date.now(),
        },
        ...(prev.activities || []),
      ].slice(0, 40),
    }));
    showToast(`+${DAILY_BONUS_COINS}🪙 Daily Bonus claimed!`);
  };

  const handleSavePetName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    commitPetUpdate(() => ({ name: trimmed }), 0, `renamed their pet to ${trimmed}!`, '🏷️');
    setIsEditingName(false);
    showToast(`Renamed to ${trimmed}!`);
  };

  const handleSaveLoveNote = () => {
    const trimmed = noteInput.trim();
    if (!trimmed) return;
    playSfx('cuddle', muted);
    updateWorld((prev) => ({
      ...prev,
      loveNote: { text: trimmed, author: currentUser, updatedAt: Date.now() },
      activities: [
        {
          id: Math.random().toString(36).slice(2),
          actor: currentUser,
          text: `pinned a sweet love note: "${trimmed}"`,
          emoji: '💌',
          timestamp: Date.now(),
        },
        ...(prev.activities || []),
      ].slice(0, 40),
    }));
    setIsEditingNote(false);
    showToast('Love note pinned! 💌');
  };

  const handleSwitchRoom = (roomId) => {
    setCurrentRoom(roomId);
    setShowFoodDrawer(false);
    setIsSittingAtTable(false);
    if (!activePet.isSleeping) {
      setIsPetOnBed(false);
      movePetTo(46, 66, 650);
    }
  };

  const handleSpinGacha = () => {
    if (gachaRolling) return;
    if (world.coins < GACHA_COST) {
      showToast(`Need ${GACHA_COST}🪙 to spin Gacha!`);
      return;
    }
    setGachaRolling(true);
    setGachaResult(null);

    setTimeout(() => {
      const spec = rollGachaSpecies();
      playSfx('gacha', muted);
      const existing = Object.values(world.pets).find((p) => p.speciesId === spec.id);

      if (existing) {
        updateWorld((prev) => ({
          ...prev,
          coins: prev.coins - GACHA_COST + 50,
          pets: {
            ...prev.pets,
            [existing.id]: { ...existing, stars: (existing.stars || 1) + 1 },
          },
          activities: [
            {
              id: Math.random().toString(36).slice(2),
              actor: currentUser,
              text: `upgraded ${existing.name} to ★${(existing.stars || 1) + 1} (+50🪙 refund)!`,
              emoji: '⭐',
              timestamp: Date.now(),
            },
            ...(prev.activities || []),
          ].slice(0, 40),
        }));
        setGachaResult({ species: spec, isDuplicate: true, stars: (existing.stars || 1) + 1 });
      } else {
        const newPet = {
          id: `pet_${Date.now()}`,
          speciesId: spec.id,
          name: spec.defaultName,
          adoptedAt: Date.now(),
          adoptedBy: currentUser,
          stars: 1,
          hunger: 90,
          happiness: 95,
          energy: 95,
          hygiene: 100,
          isSleeping: false,
          lastUpdated: Date.now(),
        };
        updateWorld((prev) => ({
          ...prev,
          coins: prev.coins - GACHA_COST,
          activePetId: newPet.id,
          pets: { ...prev.pets, [newPet.id]: newPet },
          activities: [
            {
              id: Math.random().toString(36).slice(2),
              actor: currentUser,
              text: `adopted ${newPet.name} the ${spec.rarity} ${spec.speciesName}!`,
              emoji: '🎁',
              timestamp: Date.now(),
            },
            ...(prev.activities || []),
          ].slice(0, 40),
        }));
        setGachaResult({ species: spec, isDuplicate: false, stars: 1 });
      }
      setGachaRolling(false);
    }, 1100);
  };

  const handleFinishMinigame = (gameId, gameName, score, coins) => {
    playSfx('coin', muted);
    updateWorld((prev) => ({
      ...prev,
      coins: prev.coins + coins,
      scores: [
        {
          id: Math.random().toString(36).slice(2),
          player: currentUser,
          gameId,
          gameName,
          score,
          coinsEarned: coins,
          timestamp: Date.now(),
        },
        ...(prev.scores || []),
      ].slice(0, 60),
      activities: [
        {
          id: Math.random().toString(36).slice(2),
          actor: currentUser,
          text: `scored ${score} in ${gameName} (+${coins}🪙)!`,
          emoji: '🏆',
          timestamp: Date.now(),
        },
        ...(prev.activities || []),
      ].slice(0, 40),
    }));
    setActiveMinigame(null);
    showToast(`+${coins}🪙 added to shared wallet!`);
  };

  const leaderboard = useMemo(() => {
    const scores = world.scores || [];
    let rTotal = 0;
    let uTotal = 0;
    let rGames = 0;
    let uGames = 0;
    for (const s of scores) {
      if (s.player === 'Ronald') {
        rTotal += s.score;
        rGames += 1;
      } else if (s.player === 'Ulfah') {
        uTotal += s.score;
        uGames += 1;
      }
    }
    return { rTotal, uTotal, rGames, uGames };
  }, [world.scores]);

  const glassPill =
    'bg-[#FFFDF9]/90 backdrop-blur-md border-[1.5px] border-[#E6D8C5] text-[#3B2618] shadow-[0_3px_0_#E6D8C5]';

  // ============================================================================
  // SCREEN 1: USER PICKER (RONALD vs ULFAH)
  // ============================================================================
  if (!currentUser) {
    return (
      <div className="playful-font min-h-[100dvh] w-full flex items-center justify-center paper-grain p-5">
        <style>{PET_ANIMATION_CSS}</style>
        <div className="w-full max-w-[372px] rounded-[34px] bg-[#FFFDF9] border-2 border-[#E6D8C5] shadow-[0_10px_0_#E6D8C5,0_24px_48px_rgba(59,38,24,0.08)] px-6 py-8 text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#F7EFE4] border border-[#E6D8C5] text-[#8C5E3C] text-[10px] font-extrabold tracking-[0.14em] uppercase">
            <span>Est. Together</span>
            <span>•</span>
            <span>{jakartaTime.skyPalette.icon} {jakartaTime.formattedTime} WIB</span>
          </div>

          <div className="flex justify-center -my-1">
            <div className="relative p-3 rounded-full bg-[#F7EFE4] border-2 border-[#E6D8C5]">
              <AnimatedStickerPet
                speciesId={activePet.speciesId}
                outfit={activePet.outfit}
                isSleeping={activePet.isSleeping}
                isHappy={!activePet.isSleeping}
                size={112}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <h1 className="serif-display text-[28px] leading-tight font-bold text-[#3B2618] tracking-tight">
              Ronald &amp; Ulfah
            </h1>
            <p className="text-xs font-semibold text-[#8C6D56]">
              Tap your name to check in on <span className="text-[#D95D78] font-bold">{activePet.name}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3.5 pt-1">
            {[
              {
                name: 'Ulfah',
                cardStyle: 'bg-[#FDF3F5] hover:bg-[#FAE6EB] border-[#ECC5CE] text-[#5F2131] shadow-[0_4px_0_#ECC5CE]',
                pillStyle: 'bg-[#D95D78] text-white',
              },
              {
                name: 'Ronald',
                cardStyle: 'bg-[#F2F7FB] hover:bg-[#E6F0F8] border-[#C5D9EA] text-[#1E3A5F] shadow-[0_4px_0_#C5D9EA]',
                pillStyle: 'bg-[#3B7EA1] text-white',
              },
            ].map((p) => (
              <button
                key={p.name}
                onClick={() => {
                  playSfx('cuddle', muted);
                  handleSelectUser(p.name);
                }}
                className={`group rounded-[24px] py-4 px-3 border-2 ${p.cardStyle} active:translate-y-1 active:shadow-none transition-all flex flex-col items-center gap-1.5`}
              >
                <div className="group-hover:-translate-y-1 transition-transform">
                  <CoupleAvatar player={p.name} size={76} />
                </div>
                <span className="serif-display text-lg font-bold">{p.name}</span>
                <span className={`mt-0.5 px-3 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${p.pillStyle}`}>
                  Enter Home
                </span>
              </button>
            ))}
          </div>

          <p className="text-[11px] font-medium text-[#A38873]">
            {cloudStatus === 'live'
              ? '🟢 Live Cloud Sync Active'
              : 'Saved automatically on this device'}
          </p>
        </div>
      </div>
    );
  }

  // ============================================================================
  // SCREEN 2: FULLSCREEN PHONE-SIZED INTERACTIVE ROOM & TRANSLUCENT UI
  // ============================================================================
  return (
    <div className="playful-font min-h-[100dvh] w-full flex items-center justify-center paper-grain sm:p-4">
      <style>{PET_ANIMATION_CSS}</style>

      <div className="relative w-full h-[100dvh] sm:h-[812px] sm:max-w-[400px] sm:rounded-[44px] sm:border-[5px] sm:border-[#E6D8C5] sm:shadow-[0_14px_0_#D8C6AE,0_28px_60px_rgba(59,38,24,0.16)] overflow-hidden flex flex-col select-none bg-[#FAF6F0]">
        {/* INTERACTIVE FULLSCREEN ROOM LAYER */}
        <div onClick={handleStageTap} className="absolute inset-0 z-0 cursor-pointer">
          <IllustratedRoomBackdrop
            roomId={currentRoom}
            isSleeping={activePet.isSleeping && currentRoom === 'bedroom'}
            jakartaTime={jakartaTime}
            isPetOnBed={isPetOnBed}
            showHints={showRoomHints}
            onSofaClick={() => {
              playSfx('cuddle', muted);
              setActiveTab('arcade');
            }}
            onTableClick={() => {
              playSfx('cuddle', muted);
              if (showFoodDrawer) {
                handleCloseFoodDrawer();
              } else {
                if (activePet.isSleeping) {
                  showToast(`Wake your pets up before mealtime!`);
                  return;
                }
                setShowFoodDrawer(true);
                setIsSittingAtTable(true);
                setIsPetOnBed(false);
                movePetTo(22, 54, 700);
                setTimeout(() => setPetFacing(1), 650);
              }
            }}
            onStoveClick={() => {
              playSfx('sizzle', muted);
              handleCloseFoodDrawer();
              setShowCookModal(true);
            }}
            onBedClick={handleBedClick}
            onLampClick={handleLampClick}
            onTubClick={handleBubbleBath}
            onToiletClick={handleToiletClick}
            onWardrobeClick={() => {
              playSfx('cuddle', muted);
              setActiveTab('wardrobe');
            }}
            onBoardClick={() => {
              playSfx('cuddle', muted);
              setActiveTab('leaderboard');
            }}
            onParkPlayClick={handleParkFetch}
          />

          {currentRoom === 'living' && activeTab === 'home' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                playSfx('gacha', muted);
                setActiveTab('gacha');
              }}
              style={{ left: '16%', top: '75%' }}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center active:scale-90 transition"
              title="Tap Egg to Adopt New Pets (Gacha)"
            >
              <span className="text-4xl pet-tilt drop-shadow">🥚</span>
              <span className="px-2 py-0.5 -mt-1 rounded-full bg-amber-100/90 border border-amber-300 text-[9px] font-black text-amber-900 shadow-xs">
                Gacha
              </span>
            </button>
          )}

          {(!activePet.isSleeping || currentRoom === 'bedroom') &&
            companionPets.map((buddy, idx) => {
              const buddyIsSleeping = buddy.isSleeping || activePet.isSleeping;
              const buddyOnBed = currentRoom === 'bedroom' && (isPetOnBed || buddyIsSleeping);
              const buddyAtTable = currentRoom === 'dining' && isSittingAtTable;

              const bx = buddyOnBed
                ? idx === 0
                  ? '48%'
                  : '33%'
                : buddyAtTable
                ? idx === 0
                  ? '78%'
                  : '50%'
                : idx === 0
                ? '76%'
                : '22%';
              const by = buddyOnBed
                ? idx === 0
                  ? '44%'
                  : '48%'
                : buddyAtTable
                ? idx === 0
                  ? '54%'
                  : '69%'
                : idx === 0
                ? '60%'
                : '62%';

              const buddyFacing = buddyAtTable && idx === 0 ? -1 : 1;

              return (
                <button
                  key={buddy.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    playSfx('cuddle', muted);
                    updateWorld((prev) => ({ ...prev, activePetId: buddy.id }));
                    showToast(`Switched focus to ${buddy.name}!`);
                  }}
                  style={{
                    left: bx,
                    top: by,
                    transition: 'left 850ms cubic-bezier(0.34,1.2,0.64,1), top 850ms cubic-bezier(0.34,1.2,0.64,1)',
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-10 active:scale-90"
                  title={`Tap to focus on ${buddy.name}`}
                >
                  {buddyAtTable && !isEating && !buddyIsSleeping && idx === 0 && (
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-white/95 border-2 border-orange-300 shadow text-[9px] font-bold text-orange-700 whitespace-nowrap animate-bounce">
                      😋 Yum~
                    </div>
                  )}
                  <AnimatedStickerPet
                    speciesId={buddy.speciesId}
                    outfit={buddy.outfit}
                    isSleeping={buddyIsSleeping}
                    isEating={isEating && buddyAtTable}
                    isWaiting={buddyAtTable && !isEating}
                    isHappy={isHappy}
                    facing={buddyFacing}
                    size={buddyOnBed || buddyAtTable ? 84 : 68}
                  />
                </button>
              );
            })}

          {droppedItem && (
            <div
              style={{ left: `${droppedItem.x}%`, top: `${droppedItem.y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-10 text-3xl animate-bounce pointer-events-none"
            >
              {droppedItem.emoji}
            </div>
          )}

          {(!activePet.isSleeping || currentRoom === 'bedroom') && (
            <div
              onClick={handleCuddlePet}
              style={{
                left: `${activePet.isSleeping && !isPetOnBed ? 18 : petPos.x}%`,
                top: `${activePet.isSleeping && !isPetOnBed ? 44 : petPos.y}%`,
                transform: `translate(-50%, -50%) scale(${growthInfo.scale})`,
                transition: 'left 850ms cubic-bezier(0.34,1.2,0.64,1), top 850ms cubic-bezier(0.34,1.2,0.64,1)',
              }}
              className="absolute z-20 cursor-pointer active:scale-90"
            >
              {isSittingAtTable && !isEating && !activePet.isSleeping ? (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-white/95 border-2 border-orange-300 shadow text-[10px] font-bold text-orange-700 whitespace-nowrap animate-bounce">
                  🍽️ Waiting for food~
                </div>
              ) : isPooping ? (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-white/95 border-2 border-amber-300 shadow text-[10px] font-bold text-amber-900 whitespace-nowrap animate-bounce">
                  💩 Pooping...
                </div>
              ) : (
                needsPoop &&
                !activePet.isSleeping && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSwitchRoom('bathroom');
                      showToast(`Tap the toilet so ${activePet.name} can poop! 🚽`);
                    }}
                    className="absolute -top-7 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-white/95 border-2 border-amber-300 shadow text-[10px] font-bold text-amber-800 whitespace-nowrap animate-bounce"
                    title="Poop time! Go to the Bathroom toilet"
                  >
                    💩 Toilet!
                  </button>
                )
              )}
              <AnimatedStickerPet
                speciesId={activePet.speciesId}
                outfit={activePet.outfit}
                isSleeping={activePet.isSleeping}
                isWalking={isWalking}
                isEating={isEating || isPooping}
                isWaiting={isSittingAtTable && !isEating}
                isHappy={isHappy}
                facing={petFacing}
                size={104}
              />
            </div>
          )}

          {floatingHearts.map((h) => (
            <span
              key={h.id}
              style={{ left: `${h.x}%`, top: `${h.y}%` }}
              className="absolute -translate-x-1/2 text-2xl pet-bubble pointer-events-none z-30"
            >
              💖
            </span>
          ))}
        </div>

        {/* TOP TRANSLUCENT STATUS BAR */}
        <header className="relative z-30 flex items-center justify-between px-3.5 pt-3.5 pb-1.5">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleSelectUser(null)}
              className={`inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full text-xs font-extrabold active:translate-y-0.5 transition ${glassPill}`}
              title="Switch between Ronald & Ulfah"
            >
              <CoupleAvatar player={currentUser} size={22} />
              <span>{currentUser}</span>
              {cloudStatus === 'live' && (
                <span className="w-2 h-2 rounded-full bg-emerald-500" title="Live synced between Ronald & Ulfah" />
              )}
            </button>

            {/* LIVE JAKARTA CLOCK PILL (WIB) */}
            <div
              onClick={() =>
                showToast(`Jakarta Time: ${jakartaTime.formattedTime} WIB (${jakartaTime.skyPalette.label})`)
              }
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold cursor-pointer active:scale-95 transition ${
                jakartaTime.isNight
                  ? 'bg-[#1E293B]/90 backdrop-blur-md border-[1.5px] border-[#475569] text-[#F8FAFC] shadow-[0_3px_0_#0F172A]'
                  : glassPill
              }`}
              title="Real-time Jakarta (WIB) Clock"
            >
              <span>{jakartaTime.skyPalette.icon}</span>
              <span className="tabular-nums">{jakartaTime.formattedTime}</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-extrabold ${glassPill}`}>
              <span>🪙</span>
              <span>{world.coins}</span>
            </div>
            <button
              onClick={() => setActiveTab('leaderboard')}
              className={`p-1.5 rounded-full active:translate-y-0.5 transition ${glassPill}`}
              title="Ronald vs. Ulfah Leaderboard"
            >
              <Trophy className="w-3.5 h-3.5 text-[#C88A2E]" />
            </button>
            <button
              onClick={() => setActiveTab('diary')}
              className={`p-1.5 rounded-full active:translate-y-0.5 transition ${glassPill}`}
              title="Shared Care Diary"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#D95D78]" />
            </button>
            <button
              onClick={() => setMuted((m) => !m)}
              className={`p-1.5 rounded-full active:translate-y-0.5 transition ${glassPill}`}
              title={muted ? 'Unmute SFX' : 'Mute SFX'}
            >
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </header>

        {/* COLLAPSIBLE MUSIC PLAYER (AUTO-MINIMIZES TO MUSIC LOGO AFTER 3s IDLE) */}
        <audio
          ref={audioRef}
          src={playlist[trackIndex]?.file}
          onEnded={handleSkipTrack}
          preload="none"
        />
        <div className="absolute right-3.5 top-16 z-40">
          {!musicExpanded ? (
            <button
              onClick={handleOpenMusicPlayer}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 ${glassPill} ${
                isPlayingMusic ? 'ring-2 ring-[#D95D78]/50' : ''
              }`}
              title="Open Music Player"
            >
              <Music
                className={`w-4 h-4 ${
                  isPlayingMusic ? 'text-[#D95D78] animate-pulse' : 'text-[#6E4D37]'
                }`}
              />
            </button>
          ) : (
            <div
              onMouseMove={resetMusicIdleTimer}
              onTouchStart={resetMusicIdleTimer}
              className={`flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full transition-all ${glassPill}`}
            >
              <Music
                className={`w-3.5 h-3.5 shrink-0 ${
                  isPlayingMusic ? 'text-[#D95D78] animate-pulse' : 'text-[#8C6D56]'
                }`}
              />
              <span className="max-w-[92px] truncate text-[10.5px] font-extrabold text-[#3B2618]">
                {playlist[trackIndex]?.title || 'No Track'}
              </span>
              <button
                onClick={handleTogglePlayPause}
                className="p-1.5 rounded-full bg-[#D95D78] text-white active:scale-90 transition"
                title={isPlayingMusic ? 'Pause' : 'Play'}
              >
                {isPlayingMusic ? (
                  <Pause className="w-3 h-3 fill-white" />
                ) : (
                  <Play className="w-3 h-3 fill-white" />
                )}
              </button>
              <button
                onClick={handleSkipTrack}
                className="p-1.5 rounded-full bg-[#F5ECE0] hover:bg-[#EBDEC9] text-[#5C3D2E] active:scale-90 transition"
                title="Skip Song"
              >
                <SkipForward className="w-3 h-3" />
              </button>
              <button
                onClick={handleStopMusic}
                className="p-1.5 rounded-full bg-[#F5ECE0] hover:bg-[#EBDEC9] text-[#5C3D2E] active:scale-90 transition"
                title="Stop Song"
              >
                <Square className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* FLOATING TOAST NOTIFICATION */}
        {toast && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 rounded-full bg-[#3B2618] border border-[#6E4D37] text-[#FFFDF9] text-[11px] font-bold shadow-lg whitespace-nowrap">
            {toast}
          </div>
        )}

        {/* HOME TAB OVERLAY */}
        {activeTab === 'home' && (
          <div className="relative z-20 flex-1 flex flex-col justify-between px-3.5 pb-24 pointer-events-none">
            <div className="space-y-2 pointer-events-auto w-full">
              {activeNeedAlert && (
                <div className="w-full px-3.5 py-2 rounded-2xl bg-[#FFF1F3]/95 backdrop-blur-md border-2 border-[#F3B8C4] text-[#5F2131] shadow-[0_3px_0_#F3B8C4] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg animate-bounce shrink-0">{activeNeedAlert.emoji}</span>
                    <div className="min-w-0">
                      <div className="text-[11px] font-extrabold truncate">{activeNeedAlert.title}</div>
                      <div className="text-[9.5px] font-semibold text-[#8C4A58] truncate">{activeNeedAlert.desc}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      playSfx('cuddle', muted);
                      activeNeedAlert.onAction();
                    }}
                    className="px-3 py-1 rounded-full bg-[#D95D78] text-white text-[10px] font-extrabold shrink-0 active:scale-95 transition"
                  >
                    {activeNeedAlert.actionLabel}
                  </button>
                </div>
              )}

              <div className="transition-all duration-300">
                {!statusExpanded ? (
                  <button
                    onClick={expandStatusCard}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full active:scale-95 transition ${glassPill}`}
                    title="Tap to expand status"
                  >
                    <span className="serif-display text-xs font-bold text-[#3B2618]">{activePet.name}</span>
                    <span className="text-[10px] font-extrabold text-[#E68A47]">🍓{liveStats.hunger}%</span>
                    <span className="text-[10px] font-extrabold text-[#DF6A84]">💖{liveStats.happiness}%</span>
                    <span className="text-[10px] font-extrabold text-[#DFB048]">⚡{liveStats.energy}%</span>
                    <span className="text-[10px] font-extrabold text-[#5BA4CF]">🫧{liveStats.hygiene}%</span>
                  </button>
                ) : (
                  <div
                    onMouseMove={resetStatusIdleTimer}
                    onTouchStart={resetStatusIdleTimer}
                    className={`rounded-[26px] px-3.5 py-2.5 space-y-2 ${glassPill}`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isEditingName ? (
                          <div className="flex items-center gap-1">
                            <input
                              value={nameInput}
                              onChange={(e) => setNameInput(e.target.value)}
                              maxLength={16}
                              className="w-24 px-2 py-0.5 text-xs font-bold rounded-lg border border-[#D95D78] text-[#3B2618] bg-white focus:outline-none"
                              autoFocus
                            />
                            <button onClick={handleSavePetName} className="p-1 rounded-lg bg-[#4D9E6A] text-white">
                              <Check className="w-3 h-3" />
                            </button>
                            <button onClick={() => setIsEditingName(false)} className="p-1 rounded-lg bg-[#EAE0D2] text-[#5C3D2E]">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="serif-display text-[15px] font-bold truncate text-[#3B2618]">{activePet.name}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F5ECE0] border border-[#E6D8C5] text-[#7A5438] shrink-0">
                              {growthInfo.stage} · {formatAge(ageMs)}
                            </span>
                            <span className="text-[10px] font-extrabold text-[#C88A2E] shrink-0">
                              ★{activePet.stars || 1}
                            </span>
                            {activePet.isSleeping && (
                              <button
                                onClick={() => handleSwitchRoom('bedroom')}
                                className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-[#E8ECF8] text-[#3C4B7A] border border-[#C6D0EC] shrink-0 active:scale-95 transition"
                                title="Go to Bedroom"
                              >
                                🌙 {activePet.wakeAt ? `Wakes ${formatWakeTimeWIB(activePet.wakeAt)}` : 'In Bed'}
                              </button>
                            )}
                          </>
                        )}
                      </div>

                      {!isEditingName && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => {
                              setNameInput(activePet.name);
                              setIsEditingName(true);
                            }}
                            className="p-1.5 rounded-full bg-[#F5ECE0] hover:bg-[#EBDEC9] text-[#6E4D37] transition"
                            title="Rename pet"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => {
                              setNoteInput(world.loveNote?.text || '');
                              setIsEditingNote((v) => !v);
                            }}
                            className="p-1.5 rounded-full bg-[#FDECEF] hover:bg-[#FAD9DF] text-[#D95D78] transition"
                            title="Pin couple love note"
                          >
                            <Heart className="w-3 h-3 fill-[#D95D78]" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { icon: '🍓', val: liveStats.hunger, color: 'bg-[#E68A47]' },
                        { icon: '💖', val: liveStats.happiness, color: 'bg-[#DF6A84]' },
                        { icon: '⚡', val: liveStats.energy, color: 'bg-[#DFB048]' },
                        { icon: '🫧', val: liveStats.hygiene, color: 'bg-[#5BA4CF]' },
                      ].map((st, i) => (
                        <div key={i} className="space-y-1">
                          <div className="flex items-center justify-between text-[9.5px] font-extrabold text-[#6E4D37]">
                            <span>{st.icon}</span>
                            <span>{st.val}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[#EFE6D8] overflow-hidden">
                            <div className={`h-full rounded-full ${st.color}`} style={{ width: `${st.val}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {isEditingNote ? (
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <input
                          value={noteInput}
                          onChange={(e) => setNoteInput(e.target.value)}
                          placeholder={`Note for ${isRonald ? 'Ulfah' : 'Ronald'}...`}
                          maxLength={90}
                          className="flex-1 px-2.5 py-1 rounded-xl border border-[#E6D8C5] text-[11px] font-semibold text-[#3B2618] bg-white focus:outline-none"
                          autoFocus
                        />
                        <button onClick={handleSaveLoveNote} className="p-1.5 rounded-xl bg-[#D95D78] text-white">
                          <Send className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      world.loveNote?.text && (
                        <p className="text-[10px] font-semibold text-[#7A5438] truncate">
                          💌 &ldquo;{world.loveNote.text}&rdquo; — <span className="font-bold">{world.loveNote.author}</span>
                        </p>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="pointer-events-auto">
              {showFoodDrawer && (
                <div className="rounded-[30px] p-3.5 bg-white/88 backdrop-blur-xl border-2 border-white shadow-[0_8px_24px_rgba(249,115,22,0.18)] space-y-2.5 text-amber-950 max-h-[55vh] overflow-y-auto">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-sm font-bold text-orange-900">🍽️ Shared Kitchen</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          handleCloseFoodDrawer();
                          setShowCookModal(true);
                        }}
                        className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-[11px] font-bold border-2 border-amber-300 active:scale-95 transition"
                      >
                        🍳 Cook
                      </button>
                      <button
                        onClick={handleCloseFoodDrawer}
                        className="p-1 rounded-full bg-orange-100/80 text-orange-700 hover:bg-orange-200 transition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {COOKING_RECIPES.some((r) => (world.cookedInventory?.[r.id] || 0) > 0) && (
                    <div className="space-y-1">
                      <div className="text-[10px] font-black text-emerald-700 px-1">
                        👨‍🍳 Homemade Cooked Meals (Free!)
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {COOKING_RECIPES.filter((r) => (world.cookedInventory?.[r.id] || 0) > 0).map((rec) => (
                          <button
                            key={rec.id}
                            onClick={() => handleFeedCooked(rec)}
                            className="flex items-center justify-between p-2 rounded-2xl bg-emerald-50/90 hover:bg-emerald-100 border border-emerald-300 transition text-left active:scale-95"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xl">{rec.emoji}</span>
                              <div className="min-w-0">
                                <div className="text-[11px] font-extrabold text-gray-800 truncate">{rec.name}</div>
                                <div className="text-[9px] text-emerald-700 font-bold">+{rec.hunger} Food</div>
                              </div>
                            </div>
                            <span className="text-[10px] font-black text-emerald-800 bg-white px-1.5 py-0.5 rounded-lg border border-emerald-200 shrink-0">
                              x{world.cookedInventory[rec.id]}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="text-[10px] font-black text-orange-700 px-1">🍓 Quick Snacks</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {FOOD_MENU.map((food) => (
                        <button
                          key={food.id}
                          onClick={() => handleFeedPet(food)}
                          className="flex items-center justify-between p-2 rounded-2xl bg-white/75 hover:bg-white border border-orange-200/70 transition text-left active:scale-95"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-xl">{food.emoji}</span>
                            <div>
                              <div className="text-[11px] font-extrabold text-gray-800">{food.name}</div>
                              <div className="text-[9px] text-orange-700 font-bold">+{food.hunger} Food</div>
                            </div>
                          </div>
                          <span className="text-[10px] font-black text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded-lg">
                            {food.cost}🪙
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECONDARY TABS */}
        {activeTab !== 'home' && (
          <main className="relative z-20 flex-1 overflow-y-auto px-3.5 pt-2 pb-24">
            <div className="rounded-[30px] bg-[#FFFDF9]/95 backdrop-blur-xl border-2 border-[#E6D8C5] p-4 shadow-[0_8px_0_#E6D8C5] min-h-full space-y-4">
              <div className="flex items-center justify-between pb-2.5 border-b border-[#EFE6D8]">
                <button
                  onClick={() => {
                    setActiveTab('home');
                    setActiveMinigame(null);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#F5ECE0] hover:bg-[#EBDEC9] border border-[#E6D8C5] text-[#5C3D2E] text-xs font-extrabold transition active:scale-95"
                >
                  ← Room
                </button>
                <div className="flex items-center gap-1">
                  {[
                    { id: 'wardrobe', emoji: '👗' },
                    { id: 'gacha', emoji: '🎁' },
                    { id: 'arcade', emoji: '🎮' },
                    { id: 'leaderboard', emoji: '🏆' },
                    { id: 'diary', emoji: '📔' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setActiveTab(t.id);
                        if (t.id !== 'arcade') setActiveMinigame(null);
                      }}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition border ${
                        activeTab === t.id
                          ? 'bg-[#3B2618] text-white border-[#3B2618] shadow-xs scale-105'
                          : 'bg-[#F7EFE4] border-[#E6D8C5] text-[#6E4D37]'
                      }`}
                    >
                      {t.emoji}
                    </button>
                  ))}
                </div>
              </div>

              {activeTab === 'wardrobe' && (
                <div className="space-y-3.5">
                  <div className="rounded-3xl p-3.5 bg-gradient-to-br from-pink-100 via-amber-50 to-sky-100 border-2 border-white shadow-xs flex items-center justify-between gap-3">
                    <div className="flex flex-col items-center justify-center bg-white/80 rounded-2xl p-2 border border-pink-200 shrink-0">
                      <AnimatedStickerPet
                        speciesId={activePet.speciesId}
                        outfit={activePet.outfit}
                        isHappy
                        size={88}
                      />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-black text-amber-950 truncate">{activePet.name}&apos;s Closet</span>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                          🪙 {world.coins}
                        </span>
                      </div>
                      <p className="text-[10px] font-bold text-amber-800/75">
                        Buy hats, shirts &amp; full costumes with coins!
                      </p>
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {(['hat', 'shirt', 'costume']).map((slot) => {
                          const eqId = activePet.outfit?.[slot];
                          const eqItem = OUTFIT_CATALOG.find((o) => o.id === eqId);
                          return (
                            <span
                              key={slot}
                              className="text-[9px] font-black px-2 py-0.5 rounded-full bg-white/90 text-rose-700 border border-rose-200"
                            >
                              {eqItem ? `${eqItem.emoji} ${eqItem.name}` : `No ${slot}`}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 bg-amber-100/70 p-1 rounded-2xl border border-amber-200">
                    {[
                      { id: 'hat', label: '🎩 Hats', count: OUTFIT_CATALOG.filter((o) => o.slot === 'hat').length },
                      { id: 'shirt', label: '👕 Shirts', count: OUTFIT_CATALOG.filter((o) => o.slot === 'shirt').length },
                      { id: 'costume', label: '🦁 Costumes', count: OUTFIT_CATALOG.filter((o) => o.slot === 'costume').length },
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setWardrobeCategory(cat.id)}
                        className={`py-1.5 px-2 rounded-xl text-[11px] font-black transition ${
                          wardrobeCategory === cat.id
                            ? 'bg-white text-rose-600 shadow-xs'
                            : 'text-amber-900/75 hover:text-amber-950'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {OUTFIT_CATALOG.filter((item) => item.slot === wardrobeCategory).map((item) => {
                      const isOwned = (world.ownedOutfits || []).includes(item.id);
                      const isEquipped = activePet.outfit?.[item.slot] === item.id;
                      const canAfford = world.coins >= item.cost;

                      return (
                        <button
                          key={item.id}
                          onClick={() => handleBuyOrEquipOutfit(item)}
                          className={`p-2.5 rounded-2xl border-2 text-left flex flex-col justify-between gap-1.5 transition active:scale-95 ${
                            isEquipped
                              ? 'bg-rose-50 border-rose-400 shadow-xs'
                              : isOwned
                              ? 'bg-white border-emerald-200 hover:border-emerald-300'
                              : canAfford
                              ? 'bg-amber-50/80 border-amber-200 hover:bg-amber-100/80'
                              : 'bg-gray-50 border-gray-200 opacity-60'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-2xl">{item.emoji}</span>
                            {isEquipped ? (
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-rose-500 text-white">
                                Wearing
                              </span>
                            ) : isOwned ? (
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                Wear
                              </span>
                            ) : (
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                                {item.cost}🪙
                              </span>
                            )}
                          </div>
                          <div>
                            <div className="text-xs font-black text-gray-800 leading-tight">{item.name}</div>
                            <div className="text-[9px] font-semibold text-gray-500 line-clamp-1 mt-0.5">
                              {item.desc}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeTab === 'gacha' && (
                <div className="space-y-4">
                  <div className="rounded-3xl p-4 bg-gradient-to-br from-pink-100 via-purple-50 to-amber-100 border border-white text-center space-y-3">
                    <div className="text-xs font-black text-purple-700 uppercase tracking-wider">
                      ✨ Pet Capsule Gacha ✨
                    </div>
                    <div className="flex justify-center py-1">
                      {gachaRolling ? (
                        <div className="text-6xl animate-bounce">🥚</div>
                      ) : gachaResult ? (
                        <div className="flex flex-col items-center gap-1">
                          <AnimatedStickerPet speciesId={gachaResult.species.id} size={96} />
                          <span className="text-sm font-black text-gray-800">
                            {gachaResult.isDuplicate
                              ? `★${gachaResult.stars} ${gachaResult.species.speciesName} Upgrade! (+50🪙)`
                              : `Welcome ${gachaResult.species.defaultName} the ${gachaResult.species.speciesName}!`}
                          </span>
                        </div>
                      ) : (
                        <div className="text-6xl pet-tilt">🎁</div>
                      )}
                    </div>
                    <button
                      onClick={handleSpinGacha}
                      disabled={gachaRolling}
                      className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-rose-500 to-purple-500 text-white font-black text-sm shadow-md active:scale-95 transition disabled:opacity-60"
                    >
                      {gachaRolling ? 'Hatching Capsule...' : `Adopt New Pet (${GACHA_COST}🪙)`}
                    </button>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xs font-black text-gray-700 uppercase tracking-wide">
                      Your Pet Family ({Object.keys(world.pets).length}/16)
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.values(world.pets).map((pet) => {
                        const spec = getSpecies(pet.speciesId);
                        const isSelected = pet.id === activePet.id;
                        return (
                          <button
                            key={pet.id}
                            onClick={() => {
                              updateWorld((prev) => ({ ...prev, activePetId: pet.id }));
                              showToast(`${pet.name} is now active!`);
                            }}
                            className={`p-2.5 rounded-2xl border-2 flex items-center gap-2 text-left transition ${
                              isSelected
                                ? 'bg-rose-50 border-rose-400 shadow-xs'
                                : 'bg-white/80 border-gray-100'
                            }`}
                          >
                            <AnimatedStickerPet speciesId={pet.speciesId} size={46} />
                            <div className="min-w-0">
                              <div className="text-xs font-black text-gray-800 truncate">{pet.name}</div>
                              <div className="text-[9px] font-bold text-gray-500 truncate">{spec.speciesName}</div>
                              <div className="text-[9px] font-black text-amber-600">★{pet.stars || 1}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xs font-black text-gray-700 uppercase tracking-wide">
                      16-Pet Sticker Dex
                    </h3>
                    <div className="grid grid-cols-4 gap-1.5">
                      {PET_SPECIES.map((spec) => {
                        const owned = Object.values(world.pets).some((p) => p.speciesId === spec.id);
                        return (
                          <div
                            key={spec.id}
                            className={`rounded-2xl p-1.5 border text-center flex flex-col items-center ${
                              owned ? `bg-gradient-to-br ${spec.bg} ${spec.border}` : 'bg-gray-100 border-gray-200 opacity-50 grayscale'
                            }`}
                          >
                            <AnimatedStickerPet speciesId={spec.id} size={44} />
                            <span className="text-[8px] font-black text-gray-700 leading-tight mt-0.5 line-clamp-1">
                              {spec.defaultName}
                            </span>
                            <span className={`text-[7px] font-black px-1 rounded-full border mt-0.5 ${RARITY_STYLES[spec.rarity]}`}>
                              {spec.rarity}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'arcade' && (
                <div className="space-y-3">
                  {!activeMinigame ? (
                    <>
                      <div className="text-center space-y-1">
                        <h3 className="text-base font-black text-gray-800">🎮 Couple Arcade</h3>
                        <p className="text-[11px] font-semibold text-gray-500">
                          Play minigames to earn shared coins &amp; beat {isRonald ? 'Ulfah' : 'Ronald'}!
                        </p>
                      </div>
                      {[
                        { id: 'catch', title: 'Catch the Treats', desc: 'Slide to catch falling strawberries & boba', emoji: '🍓', color: 'from-orange-100 to-amber-50 border-orange-200' },
                        { id: 'memory', title: 'Couple Memory Match', desc: 'Flip & match adorable pet pairs', emoji: '🃏', color: 'from-pink-100 to-rose-50 border-pink-200' },
                        { id: 'rush', title: '15s Heart Rush', desc: 'Tap hearts as fast as you can!', emoji: '💖', color: 'from-purple-100 to-indigo-50 border-purple-200' },
                      ].map((g) => (
                        <button
                          key={g.id}
                          onClick={() => setActiveMinigame(g.id)}
                          className={`w-full p-3.5 rounded-3xl bg-gradient-to-r ${g.color} border-2 flex items-center justify-between text-left active:scale-95 transition`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-3xl">{g.emoji}</span>
                            <div>
                              <div className="text-sm font-black text-gray-800">{g.title}</div>
                              <div className="text-[10px] font-semibold text-gray-600">{g.desc}</div>
                            </div>
                          </div>
                          <span className="px-3 py-1 rounded-full bg-white text-rose-600 text-xs font-black shadow-xs">
                            Play
                          </span>
                        </button>
                      ))}
                    </>
                  ) : activeMinigame === 'catch' ? (
                    <CatchTreatsGame onFinish={handleFinishMinigame} onExit={() => setActiveMinigame(null)} muted={muted} />
                  ) : activeMinigame === 'memory' ? (
                    <CoupleMemoryGame onFinish={handleFinishMinigame} onExit={() => setActiveMinigame(null)} muted={muted} />
                  ) : (
                    <HeartRushGame onFinish={handleFinishMinigame} onExit={() => setActiveMinigame(null)} muted={muted} />
                  )}
                </div>
              )}

              {activeTab === 'leaderboard' && (
                <div className="space-y-4">
                  <div className="text-center">
                    <h3 className="text-base font-black text-gray-800">🏆 Ronald vs. Ulfah</h3>
                    <p className="text-[11px] font-semibold text-gray-500">All-time couple arcade crown</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { name: 'Ulfah', total: leaderboard.uTotal, games: leaderboard.uGames, leading: leaderboard.uTotal > leaderboard.rTotal, bg: 'from-rose-100 to-pink-50 border-rose-200' },
                      { name: 'Ronald', total: leaderboard.rTotal, games: leaderboard.rGames, leading: leaderboard.rTotal >= leaderboard.uTotal && leaderboard.rTotal > 0, bg: 'from-indigo-100 to-sky-50 border-indigo-200' },
                    ].map((p) => (
                      <div key={p.name} className={`relative rounded-3xl p-3.5 bg-gradient-to-b ${p.bg} border-2 text-center space-y-1`}>
                        {p.leading && (
                          <Crown className="w-5 h-5 text-amber-500 fill-amber-400 absolute -top-2.5 left-1/2 -translate-x-1/2" />
                        )}
                        <div className="flex justify-center">
                          <CoupleAvatar player={p.name} size={52} />
                        </div>
                        <div className="text-sm font-black text-gray-800">{p.name}</div>
                        <div className="text-xl font-black text-rose-600">{p.total}</div>
                        <div className="text-[10px] font-bold text-gray-500">{p.games} games played</div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <h4 className="text-xs font-black text-gray-700 uppercase">Recent High Scores</h4>
                    {(world.scores || []).length === 0 ? (
                      <p className="text-xs text-gray-400 font-semibold text-center py-4">
                        No scores yet—head to Games to claim the crown!
                      </p>
                    ) : (
                      world.scores.slice(0, 10).map((s) => (
                        <div key={s.id} className="flex items-center justify-between p-2.5 rounded-2xl bg-white/80 border border-gray-100 text-xs">
                          <div className="inline-flex items-center gap-1.5 font-bold text-gray-800">
                            <CoupleAvatar player={s.player} size={20} />
                            <span>{s.player}</span>
                            <span className="text-gray-400 font-semibold">• {s.gameName}</span>
                          </div>
                          <span className="font-black text-rose-600">{s.score} pts</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'diary' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-black text-gray-800">📔 Shared Care Diary</h3>
                    <button
                      onClick={() => setShowResetModal(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 hover:bg-rose-100 text-gray-600 hover:text-rose-600 text-[10px] font-black transition"
                    >
                      <RotateCcw className="w-3 h-3" /> Reset
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(world.activities || []).map((act) => (
                      <div key={act.id} className="flex items-start gap-2.5 p-2.5 rounded-2xl bg-white/85 border border-pink-100/80">
                        <span className="text-xl">{act.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-gray-700">
                            <span className="font-black text-gray-900">{act.actor}</span> {act.text}
                          </p>
                          <p className="text-[9px] font-bold text-gray-400 mt-0.5">
                            {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </main>
        )}

        {/* BOTTOM KAWAII STICKER ROOM DOCK */}
        <nav className="absolute bottom-3 inset-x-3.5 z-30 flex items-end justify-between gap-2">
          <div className="flex-1 grid grid-cols-4 items-end px-2 py-1.5 rounded-full bg-[#FFFDF9]/92 backdrop-blur-md border-2 border-[#E6D8C5] shadow-[0_4px_0_#E6D8C5]">
            {ROOMS.slice(0, 4).map((room) => {
              const isSelected = activeTab === 'home' && currentRoom === room.id;
              return (
                <button
                  key={room.id}
                  onClick={() => {
                    setActiveTab('home');
                    handleSwitchRoom(room.id);
                  }}
                  className="relative flex flex-col items-center justify-end active:scale-90 transition"
                >
                  <RoomDockIcon roomId={room.id} active={isSelected} />
                  {isSelected && (
                    <span className="text-[9.5px] font-extrabold text-[#3B2618] leading-none -mt-1 px-1.5 py-0.5 rounded-full bg-[#F5ECE0]">
                      {room.shortLabel}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => {
              setActiveTab('home');
              handleSwitchRoom('park');
            }}
            className={`w-[66px] h-[60px] rounded-full bg-[#FFFDF9]/92 backdrop-blur-md border-2 shadow-[0_4px_0_#E6D8C5] flex flex-col items-center justify-center active:scale-90 transition ${
              activeTab === 'home' && currentRoom === 'park'
                ? 'border-[#D95D78]'
                : 'border-[#E6D8C5]'
            }`}
          >
            <RoomDockIcon roomId="park" active={activeTab === 'home' && currentRoom === 'park'} />
            <span className="text-[8.5px] font-extrabold text-[#3B2618] leading-none -mt-1.5">
              Pet Park
            </span>
          </button>
        </nav>

        {/* INTERACTIVE BATH MINIGAME MODAL */}
        {showBathGame && (
          <BathMinigameModal
            pet={activePet}
            muted={muted}
            onComplete={handleCompleteBath}
            onClose={() => setShowBathGame(false)}
          />
        )}

        {/* INTERACTIVE STOVE COOKING MODAL */}
        {showCookModal && (
          <CookingMinigameModal
            coins={world.coins}
            muted={muted}
            onCompleteCook={handleCompleteCook}
            onClose={() => setShowCookModal(false)}
          />
        )}

        {/* CUSTOM SAFE RESET CONFIRMATION MODAL */}
        {showResetModal && (
          <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-6">
            <div className="w-full max-w-xs rounded-3xl bg-white p-5 text-center space-y-3 shadow-2xl">
              <div className="text-3xl">🐾</div>
              <h3 className="text-base font-black text-gray-800">Start Fresh?</h3>
              <p className="text-xs font-semibold text-gray-500">
                This will reset Ronald &amp; Ulfah&apos;s pets, coins, and leaderboard back to Day 1.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => setShowResetModal(false)}
                  className="py-2 rounded-2xl bg-gray-100 text-gray-700 text-xs font-black"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    updateWorld(createInitialWorld());
                    setShowResetModal(false);
                    setActiveTab('home');
                    showToast('Started a fresh shared world!');
                  }}
                  className="py-2 rounded-2xl bg-rose-500 text-white text-xs font-black"
                >
                  Reset All
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
