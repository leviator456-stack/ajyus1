export const PLANS = {
  basic: {
    id: "basic",
    name: "Basic",
    model: "gemini-3-flash-preview",
    price: 1,
    currency: "INR",
    durationDays: 30,
    chatLimit: 500,
    imageLimit: 20
  },

  ultra: {
    id: "ultra",
    name: "Ultra",
    model: "gemini-3-flash-preview",
    price: 4999,
    currency: "INR",
    durationDays: 30,
    chatLimit: 2000,
    imageLimit: 40
  },

  ultra_pro: {
    id: "ultra_pro",
    name: "Ultra Pro",
    model: "gemini-3-flash-preview", 
    price: 9999,
    currency: "INR",
    durationDays: 30,
    chatLimit: 4000,
    imageLimit: 60
  }
};

export function getPlan(plan) {
  if (!plan) return null;

  const value = String(plan).trim().toLowerCase();

  // Key se search
  if (PLANS[value]) {
    return PLANS[value];
  }

  // Name se search
  return (
    Object.values(PLANS).find(
      (p) => p.name.toLowerCase() === value
    ) || null
  );
}
