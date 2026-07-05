import { Calendar, Check, History, Maximize2, Mic, Settings2, X } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';

import { resolveCategoryIcon } from '~/utils/categoryIcons';
import { perfMark, perfSpan } from '~/utils/perfDebug';

import { matchCategoryByKeywords } from '../utils/categoryKeywords';
import { categorizeFromHistory } from '../utils/historyCategorizer';
import { parseQuickInput } from '../utils/parseQuickInput';

const styles = StyleSheet.create({
  // Off-screen and inert: 1px, fully transparent, non-interactive, hidden from
  // accessibility. Just enough to force the native views to instantiate.
  hidden: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    width: 1,
    height: 1,
    opacity: 0,
  },
});

/**
 * Off-screen, non-interactive warm-up for the quick-add sheet.
 *
 * With Metro `inlineRequires` (Expo default), the quick-add sheet's dependency
 * modules — the keyword matcher (regex bucket compile), history categorizer,
 * keyboard-controller and the lucide icons it uses — are only evaluated on the
 * user's *first* open. The native `TextInput` view class is likewise cold,
 * because no screen before quick-add mounts a text input. All of that lands on
 * the JS/main thread mid-slide, which is why the first open janks while every
 * subsequent open is smooth.
 *
 * Mounting this once during idle (after the tabs have pre-loaded) pays those
 * one-time costs in the background. There is no autofocus, so the keyboard
 * never appears. Once the native view classes are registered they stay warm for
 * the session, so the host can unmount this shortly after.
 */
export function QuickAddWarmup() {
  perfMark('QuickAddWarmup: render');
  // Subscribing warms the keyboard-controller provider's animated view, which
  // is otherwise mounted lazily during the first real open.
  useReanimatedKeyboardAnimation();

  useEffect(() => {
    perfMark('QuickAddWarmup: effect start');
    // Touch the inline-required modules so their factories evaluate now rather
    // than on the first keystroke/open. Empty inputs return immediately.
    perfSpan('QuickAddWarmup.modules', () => {
      parseQuickInput('warm 1');
      matchCategoryByKeywords('warm', [], {});
      categorizeFromHistory('warm', [], { type: 'expense' });
      resolveCategoryIcon(undefined, undefined, '🏷️');
    });
    perfMark('QuickAddWarmup: effect done');
  }, []);

  return (
    <View
      style={styles.hidden}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <TextInput editable={false} caretHidden showSoftInputOnFocus={false} />
      <Calendar size={1} />
      <Check size={1} />
      <History size={1} />
      <Maximize2 size={1} />
      <Mic size={1} />
      <Settings2 size={1} />
      <X size={1} />
    </View>
  );
}
