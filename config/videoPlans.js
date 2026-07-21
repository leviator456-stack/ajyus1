export const VIDEO_PLANS = {
  video_basic: {
    id: "video_basic",
    name: "Basic Aura",
    price: 4999,
    durationDays: 30,
    videoLimit: 9
  },

  video_pro: {
    id: "video_pro",
    name: "Ultra Aura",
    price: 9999,
    durationDays: 30,
    videoLimit: 20
  },

  video_ultra: {
    id: "video_ultra",
    name: "UltraPro Aura",
    price: 19999,
    durationDays: 30,
    videoLimit: 40
  }
};

export const getVideoPlan = (planId) => {
  return VIDEO_PLANS[planId] || null;
};
