export type Testimonial = {
  /** App Store reviews carry a title; Play Store reviews do not. */
  title?: string;
  quote: string;
  /** Reviewer display name as shown on the store. */
  author: string;
  store: "appStore" | "playStore";
  /** 1-5. */
  rating: number;
  /** ISO date of the review, used for the <time> element. */
  date: string;
};

/**
 * Real customer reviews from the App Store and Google Play.
 *
 * Quotes are the reviewers' own words, with spelling, spacing and punctuation
 * tidied and emoji dropped so the wall reads evenly. They are deliberately not
 * part of the translation files — a review is quoted in the language it was
 * written in.
 *
 *   App Store:   https://apps.apple.com/my/app/money2time-expense-tracker/id6760418898
 *   Google Play: https://play.google.com/store/apps/details?id=com.nelsongan.money2time
 */
export const TESTIMONIALS: Testimonial[] = [
  {
    title: "Surprisingly meaningful",
    quote:
      "I really love this money tracking app! One of my favourite features is that it shows how much “life energy” I need to spend to buy something, which makes budgeting feel more meaningful and reflective. The UI is also super cute and pleasant to use. Super recommended!",
    author: "jamesgan99",
    store: "appStore",
    rating: 5,
    date: "2026-06-19",
  },
  {
    quote:
      "I've been using this app to track how I spend my time each day, and it's been surprisingly eye-opening. The feature that converts time into monetary value gives a clear perspective on where my hours are going and helps me stay more conscious of productivity. The interface is clean and easy to navigate. It's a great tool for anyone looking to manage their time better, build positive habits, or simply understand how they spend their day. Highly recommend.",
    author: "Liew Hup Seong",
    store: "playStore",
    rating: 5,
    date: "2026-05-26",
  },
  {
    title: "The best finance tracker app",
    quote:
      "Really love the UI design! User friendly, simple and clear, I can see everything in one shot. I like how we can add the bank logos for all accounts, it's so cute! Will definitely subscribe and share the app once I have more records. Keep it up!",
    author: "runningsoya",
    store: "appStore",
    rating: 5,
    date: "2026-06-22",
  },
  {
    quote:
      "I originally gave this app 4 stars because I wished it had a goal feature. Then I realised it actually does! I've just started my expense tracking journey, and this app has been incredibly helpful. The interface is clean, easy to use, and makes tracking my finances much less overwhelming. I subscribed to the annual plan as soon as I got comfortable using it, and I can honestly say it's worth every penny.",
    author: "Vivio See",
    store: "playStore",
    rating: 5,
    date: "2026-07-31",
  },
  {
    title: "Excellent money management tool",
    quote:
      "Excellent money tracking app! It's simple, user-friendly, and helps me keep track of my expenses and savings effortlessly. I like the recurring transactions feature so much.",
    author: "Ytrytry",
    store: "appStore",
    rating: 5,
    date: "2026-06-21",
  },
  {
    quote:
      "Loving this app so much now. I even subscribed to the lifetime plan. It has all the features that suit my tracking. I can track my recurring payments and it auto tracks them in the expenses. It has a scan receipt feature and keeps the receipt for me. I can choose which account I spend or receive money from, and create accounts to track all my bank balances and credit cards.",
    author: "Nurul Syafawati",
    store: "playStore",
    rating: 5,
    date: "2026-07-27",
  },
  {
    title: "Love the widgets",
    quote:
      "The app is very comprehensive and pretty customisable. I used to track my expenses using Excel. It's great since recording an expense is one click from the widget, and I'm able to do it easily when I'm outside.",
    author: "joncms95",
    store: "appStore",
    rating: 5,
    date: "2026-06-21",
  },
  {
    quote:
      "Among all the money tracking apps, this app is the best. The design, icons and everything are attractive. No need for complicated records, just a simple record and done.",
    author: "Itz Danny",
    store: "playStore",
    rating: 5,
    date: "2026-07-24",
  },
  {
    title: "Easy to use money tracker",
    quote:
      "Really good and easy to use interface. Lots of functionality. I'm currently using another money tracker app, but I think this will replace it.",
    author: "liquisity",
    store: "appStore",
    rating: 5,
    date: "2026-07-14",
  },
  {
    quote:
      "Best app ever to track your finances. I've been using free money manager apps with a piggy bank picture for the past 3+ years, and this is a big step up.",
    author: "Syamim Yusaini",
    store: "playStore",
    rating: 5,
    date: "2026-07-23",
  },
  {
    title: "Love this expense tracking app",
    quote:
      "This app has all the features that let us track expenses easily. Love the voice note feature especially!",
    author: "Yxchong",
    store: "appStore",
    rating: 5,
    date: "2026-06-19",
  },
];

/**
 * The award laurels beside the section heading. `users` is a raw count so it
 * formats per locale (50K, 5万, 50 mil); set either to `null` to hide it.
 */
export const SOCIAL_PROOF: { users: number | null; rating: number | null } = {
  users: 50_000,
  rating: 4.9,
};
