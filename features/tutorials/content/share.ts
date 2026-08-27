import type { Tutorial } from './types';

export const SHARE_TUTORIALS: Tutorial[] = [
  {
    id: 'split-a-bill',
    category: 'share',
    title: 'Split a bill with friends',
    summary: 'Record who owes you what, straight from the entry screen.',
    keywords: ['split', 'share', 'friends', 'owe', 'divide', 'group', 'dinner', 'tax'],
    steps: [
      {
        image: 'split-a-bill-1',
        title: 'Tap Split while you log',
        body: 'It is on the toolbar above the keypad in the full entry screen.',
      },
      {
        image: 'split-a-bill-2',
        title: 'Add the people',
        body: 'Type a name, or pick one you have split with before. Swipe a row left to remove it.',
      },
      {
        image: 'split-a-bill-3',
        title: 'Split evenly or by hand',
        body: 'Leave Split evenly on for an even share. Turn it off and type each amount yourself.',
      },
      {
        image: 'split-a-bill-6',
        title: 'Add tax and service',
        body: 'The stepper at the bottom adds a percentage to everyone at once. Tap Apply to fold it in.',
      },
      {
        image: 'split-a-bill-4',
        title: 'Save the entry',
        body: 'The Split button now carries a badge, so you can see at a glance that this one is shared.',
      },
      {
        image: 'split-a-bill-5',
        title: 'Spot it on the calendar',
        body: 'A split entry is marked in the list. The full amount left your account, and the shares are tracked separately.',
      },
    ],
  },
  {
    id: 'split-by-item',
    category: 'share',
    title: 'Split a receipt item by item',
    summary: 'When one person had the steak and the other had a salad.',
    keywords: ['itemized', 'receipt split', 'line items', 'per item', 'scan to split', 'uneven'],
    steps: [
      {
        image: 'split-by-item-1',
        title: 'Open the Split tab',
        body: 'From the plus menu. Scan to split reads a receipt for you, Manual split lets you type the lines.',
      },
      {
        image: 'split-by-item-2',
        title: 'List the items',
        body: 'One line per thing, with its price. The total adds itself up at the top.',
      },
      {
        image: 'split-by-item-3',
        title: 'Fold in tax and service',
        body: 'Set the percentage and tap Apply. It spreads across every line, so there is no separate tax row to argue about.',
      },
      {
        image: 'split-by-item-4',
        title: 'Say who had what',
        body: 'Set how many people, pick a person, then tap the items they had. Tap the same item for two people and it splits evenly between them.',
      },
      {
        image: 'split-by-item-5',
        title: 'Check and save',
        body: 'Each person gets a total with their items listed. Save split records the bill and everyone who owes you.',
      },
    ],
  },
  {
    id: 'settle-up',
    category: 'share',
    title: 'See who owes you and settle up',
    summary: 'One place for every unpaid share, with a receipt you can send.',
    keywords: ['settle', 'owe', 'debt', 'paid', 'collect', 'receipt', 'who owes you', 'qr'],
    steps: [
      {
        image: 'settle-up-1',
        title: 'Open Who owes you',
        body: 'Settings, then Who owes you. The badge counts unpaid shares.',
      },
      {
        image: 'settle-up-2',
        title: 'By person or by bill',
        body: 'By person rolls everything one friend owes into a single figure. By transaction lists it bill by bill.',
      },
      {
        image: 'settle-up-3',
        title: 'Mark it paid',
        body: 'Tap a person to see their bills. Mark paid clears one, and the payback account picker says where the money went.',
      },
      {
        image: 'settle-up-4',
        title: 'Send a receipt',
        body: 'Tap Send receipt to share an image of what they owe.',
      },
      {
        image: 'settle-up-5',
        title: 'Add your payment QR',
        body: 'The receipt carries the itemized list. Attach your own payment QR code in settings and it shows up here, so they can pay from the picture.',
      },
    ],
  },
  {
    id: 'reimbursements',
    category: 'share',
    title: 'Claim back an expense',
    summary: 'Flag something you paid for that is coming back to you.',
    keywords: ['reimbursement', 'claim', 'expense report', 'work expense', 'refund', 'pending'],
    steps: [
      {
        image: 'reimbursements-1',
        title: 'Open the extras toolbar',
        body: 'In the full entry screen, tap the icon at the right end of the toolbar above the keypad.',
      },
      {
        image: 'reimbursements-2',
        title: 'Tick Pending reimbursement',
        body: 'The entry still counts as spending for now, but it is flagged as money you expect back.',
      },
      {
        image: 'reimbursements-3',
        title: 'Open Claim back',
        body: 'Settings, then Claim back. The badge counts everything still waiting.',
      },
      {
        image: 'reimbursements-4',
        title: 'Claim it when it lands',
        body: 'Tap Claim and the money is recorded back into the account you choose.',
      },
    ],
  },
];
