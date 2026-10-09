import type { Tutorial } from './types';

export const PLAN_TUTORIALS: Tutorial[] = [
  {
    id: 'budgets',
    category: 'plan',
    title: 'Set a monthly budget',
    summary: 'Build a template once, then reuse it every month and watch each category drain.',
    keywords: ['budget', 'template', 'limit', 'allocation', 'monthly', 'spending plan', 'envelope'],
    steps: [
      {
        image: 'budgets-1',
        title: 'Open Budgeting',
        body: 'On the Insights tab, tap the icon in the top left and pick Budgeting.',
      },
      {
        image: 'budgets-2',
        title: 'Create a template',
        body: 'A template is a reusable plan. Make it once and every month can start from it. The free plan includes one template.',
      },
      {
        image: 'budgets-4',
        title: 'Split the total',
        body: 'Set a total, then give each category a share. The bar at the bottom tells you when it is fully allocated.',
      },
      {
        image: 'budgets-3',
        title: 'Go finer if you want',
        body: 'Tap a category to split its share across subcategories, so Home can be Rent plus Utilities.',
      },
      {
        image: 'budgets-6',
        title: 'Watch the month',
        body: 'The ring shows how much of the budget is gone. Budgeted and unbudgeted spending are counted separately.',
      },
      {
        image: 'budgets-7',
        title: 'Find the category that is blowing it',
        body: 'Each row shows what is left and the percentage used. Expand it to see which subcategory is doing the damage.',
      },
    ],
  },
  {
    id: 'goals',
    category: 'plan',
    title: 'Save toward a goal',
    summary: 'Set a target, move money in, and see whether you are on pace.',
    keywords: ['goal', 'savings', 'target', 'auto save', 'sinking fund', 'save up', 'deposit'],
    steps: [
      {
        image: 'goals-1',
        title: 'Open the Goals tab',
        body: 'It sits next to Accounts. Existing goals also show in your net assets.',
      },
      {
        image: 'goals-2',
        title: 'Start a new goal',
        body: 'Tap New goal. The free plan includes two active goals.',
      },
      {
        image: 'goals-3',
        title: 'Set the target',
        body: 'Name it, pick an icon, and enter the amount you are aiming for.',
      },
      {
        image: 'goals-4',
        title: 'Add a date and auto-save',
        body: 'A target date gives you an on-track pace. Auto-save moves a set amount in on a schedule, so you do not have to remember.',
      },
      {
        image: 'goals-5',
        title: 'Put money in',
        body: 'From an account moves it out of a real balance. Outside money records a gift or cash from elsewhere as income.',
      },
      {
        image: 'goals-6',
        title: 'Watch the ring fill',
        body: 'The ring, the amount saved, and the on-track line all update. Every deposit is listed underneath.',
      },
    ],
  },
  {
    id: 'loans',
    category: 'plan',
    title: 'Track a loan',
    summary: 'See what you still owe, what each payment costs you, and the date you are free.',
    keywords: [
      'loan',
      'debt',
      'mortgage',
      'car loan',
      'instalment',
      'repayment',
      'interest',
      'payoff',
    ],
    steps: [
      {
        image: 'loans-1',
        title: 'Add a Loan account',
        body: 'Settings, then Accounts, then the plus on a group. Pick Loan as the type. The free plan includes one loan.',
      },
      {
        image: 'loans-2',
        title: 'Enter any two numbers',
        body: 'Rate, total repayable, and monthly instalment are three ways of saying the same thing. Type whichever your lender gave you and the rest fill themselves in.',
      },
      {
        image: 'loans-3',
        title: 'Decide how repayments are recorded',
        body: 'Collect from picks the account the money leaves, so instalments log themselves. Count instalment as expense decides whether they also count as spending in your charts and budgets.',
      },
      {
        image: 'loans-4',
        title: 'It joins your net worth',
        body: 'The loan shows what is left, the next due date, and the monthly amount. It counts as debt, so your net assets figure is honest.',
      },
      {
        image: 'loans-5',
        title: 'Watch it shrink',
        body: 'Expand the card for how much is paid off, how much remains, and the date the last payment lands.',
      },
      {
        image: 'loans-6',
        title: 'Pay ahead when you can',
        body: 'Tap Pay to record an extra or early payment. Anything above the instalment moves the payoff date closer.',
      },
    ],
  },
];
