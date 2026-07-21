export const VIDEO_PLANS = {
  video_basic: {
    id: "video_basic",
    name: "Video Basic",
    price: 499,
    durationDays: 30,
    videoLimit: 5
  },

  video_pro: {
    id: "video_pro",
    name: "Video Pro",
    price: 999,
    durationDays: 30,
    videoLimit: 15
  },

  video_ultra: {
    id: "video_ultra",
    name: "Video Ultra",
    price: 1999,
    durationDays: 30,
    videoLimit: 40
  }
};

export const getVideoPlan = (planId) => {
  return VIDEO_PLANS[planId] || null;
};
