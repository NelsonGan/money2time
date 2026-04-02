import { Send, Square } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

export interface ChatInputMentionOption {
  id: string;
  type: 'account' | 'category';
  label: string;
  subtitle?: string;
  icon?: string | null;
}

interface ChatInputProps {
  inputDisabled?: boolean;
  sendDisabled?: boolean;
  isGenerating?: boolean;
  autoFocus?: boolean;
  onSend: (text: string) => boolean | void | Promise<boolean | void>;
  onStop?: () => void;
  placeholder?: string;
  mentionOptions?: ChatInputMentionOption[];
}

interface TextSelection {
  start: number;
  end: number;
}

interface ActiveMentionQuery {
  start: number;
  end: number;
  query: string;
}

const SEND_BUTTON_SIZE = 36;
const LINE_HEIGHT = 22;
const MAX_LINES = 6;
const MAX_INPUT_HEIGHT = LINE_HEIGHT * MAX_LINES;
const SHELL_PADDING_H = 16;
const SHELL_PADDING_V = 8;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ChatInput({
  inputDisabled = false,
  sendDisabled = false,
  isGenerating = false,
  autoFocus = false,
  onSend,
  onStop,
  placeholder,
  mentionOptions = [],
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [selection, setSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const [inputHeight, setInputHeight] = useState(LINE_HEIGHT);
  const [containerHeight, setContainerHeight] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const isSubmittingRef = useRef(false);
  const themeColors = useThemeColors();
  const sendScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    if (!autoFocus) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 600);
    return () => clearTimeout(timer);
  }, [autoFocus]);

  useEffect(() => {
    glowOpacity.value = withTiming(isFocused ? 1 : 0, { duration: 200 });
  }, [glowOpacity, isFocused]);

  const canSend = text.trim().length > 0 && !sendDisabled;
  const isExpanded = inputHeight > LINE_HEIGHT * 1.5;
  const isScrollable = inputHeight >= MAX_INPUT_HEIGHT;
  const activeMention = useMemo(() => getActiveMentionQuery(text, selection), [selection, text]);
  const filteredMentionOptions = useMemo(() => {
    if (!activeMention || inputDisabled) return [];

    const normalizedQuery = normalizeMentionSearch(activeMention.query);

    return mentionOptions
      .map((option) => ({
        option,
        score: getMentionMatchScore(option, normalizedQuery),
      }))
      .filter((entry) => Number.isFinite(entry.score))
      .sort((left, right) => {
        if (left.score !== right.score) return left.score - right.score;
        if (left.option.type !== right.option.type) {
          return left.option.type === 'account' ? -1 : 1;
        }
        return left.option.label.localeCompare(right.option.label);
      })
      .slice(0, 8)
      .map((entry) => entry.option);
  }, [activeMention, inputDisabled, mentionOptions]);

  const sendAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sendScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const handleContentSizeChange = useCallback(
    (event: { nativeEvent: { contentSize: { height: number } } }) => {
      const raw = Math.ceil(event.nativeEvent.contentSize.height);
      setInputHeight(Math.min(MAX_INPUT_HEIGHT, Math.max(LINE_HEIGHT, raw)));
    },
    [],
  );

  const handleSend = useCallback(async () => {
    if (!canSend || isSubmittingRef.current) return;
    const nextText = text.trim();
    if (!nextText) return;

    isSubmittingRef.current = true;

    const accepted = await Promise.resolve(onSend(nextText)).catch(() => false);
    isSubmittingRef.current = false;
    if (accepted === false) return;

    void triggerHaptic('medium');

    sendScale.value = withSpring(0.8, { damping: 15, stiffness: 400 });
    setTimeout(() => {
      sendScale.value = withSpring(1, { damping: 12, stiffness: 200 });
    }, 100);

    setText('');
    setSelection({ start: 0, end: 0 });
    setInputHeight(LINE_HEIGHT);

    requestAnimationFrame(() => {
      inputRef.current?.clear();
      inputRef.current?.focus();
    });
  }, [canSend, onSend, sendScale, text]);

  const handleMentionSelect = useCallback(
    (option: ChatInputMentionOption) => {
      if (!activeMention) return;
      void triggerHaptic('selection');

      const before = text.slice(0, activeMention.start);
      const after = text.slice(activeMention.end).replace(/^\s*/, '');
      const mentionText = `@${option.label}`;
      const spacer = after.length > 0 ? ' ' : '';
      const nextText = `${before}${mentionText}${spacer}${after}`;
      const cursor = (before + mentionText + spacer).length;

      setText(nextText);
      setSelection({ start: cursor, end: cursor });

      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setNativeProps({ selection: { start: cursor, end: cursor } });
      });
    },
    [activeMention, text],
  );

  return (
    <View className="px-4 pb-2 pt-3">
      <View
        className="relative"
        onLayout={(event) => setContainerHeight(event.nativeEvent.layout.height)}
      >
        {/* Mention autocomplete dropdown */}
        {filteredMentionOptions.length > 0 ? (
          <Animated.View
            entering={FadeIn.duration(150)}
            exiting={FadeOut.duration(100)}
            className="absolute left-0 right-0 max-h-52 overflow-hidden rounded-2xl"
            style={{
              bottom: containerHeight + 10,
              backgroundColor: themeColors.card,
              borderWidth: 1,
              borderColor: `${themeColors.border}50`,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.15,
              shadowRadius: 24,
              elevation: 12,
              zIndex: 20,
            }}
          >
            <ScrollView keyboardShouldPersistTaps="always">
              {filteredMentionOptions.map((option, index) => (
                <View key={option.id}>
                  {index > 0 ? (
                    <View
                      className="mx-4 h-px"
                      style={{ backgroundColor: `${themeColors.border}18` }}
                    />
                  ) : null}
                  <Pressable
                    onPress={() => handleMentionSelect(option)}
                    className="flex-row items-center gap-3 px-4 py-3"
                    android_ripple={{ color: `${themeColors.primary}10` }}
                  >
                    <View
                      className="h-9 w-9 items-center justify-center rounded-xl"
                      style={{
                        backgroundColor:
                          option.type === 'account'
                            ? `${themeColors.primary}12`
                            : `${themeColors.accent}14`,
                      }}
                    >
                      <Text variant="friendly" className="text-base">
                        {option.icon || '•'}
                      </Text>
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text
                        variant="body"
                        numberOfLines={1}
                        className="text-sm font-medium"
                        style={{ color: themeColors.text }}
                      >
                        {option.label}
                      </Text>
                      {option.subtitle ? (
                        <Text variant="caption" tone="muted" numberOfLines={1} className="text-xs">
                          {option.subtitle}
                        </Text>
                      ) : null}
                    </View>
                    <View
                      className="rounded-md px-2 py-0.5"
                      style={{
                        backgroundColor:
                          option.type === 'account'
                            ? `${themeColors.primary}10`
                            : `${themeColors.accent}10`,
                      }}
                    >
                      <Text
                        variant="caption"
                        className="text-[10px] font-medium uppercase tracking-wider"
                        style={{
                          color:
                            option.type === 'account' ? themeColors.primary : themeColors.accent,
                        }}
                      >
                        {option.type === 'account'
                          ? I18n.t('transactions.editor.account')
                          : I18n.t('transactions.editor.category')}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </Animated.View>
        ) : null}

        {/* Input shell with glow */}
        <View className="relative">
          {/* Glow layer */}
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: -2,
                left: -2,
                right: -2,
                bottom: -2,
                borderRadius: isExpanded ? 22 : 100,
                shadowColor: themeColors.primary,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.2,
                shadowRadius: 12,
                elevation: 0,
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                borderColor: `${themeColors.primary}30`,
              },
              glowStyle,
            ]}
          />

          <View
            className="flex-row"
            style={[
              styles.shell,
              {
                alignItems: isExpanded ? 'flex-end' : 'center',
                borderRadius: isExpanded ? 20 : 100,
                borderWidth: 1,
                borderColor: isFocused ? `${themeColors.primary}40` : `${themeColors.border}80`,
                backgroundColor: themeColors.surface,
              },
            ]}
          >
            <TextInput
              ref={inputRef}
              placeholder={placeholder ?? I18n.t('aiChat.placeholder')}
              placeholderTextColor={`${themeColors.textMuted}90`}
              value={text}
              onChangeText={setText}
              onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
              onContentSizeChange={handleContentSizeChange}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              editable={!inputDisabled}
              multiline
              submitBehavior="newline"
              maxLength={500}
              scrollEnabled={isScrollable}
              style={[
                styles.textInput,
                {
                  color: themeColors.text,
                  minHeight: LINE_HEIGHT,
                  maxHeight: MAX_INPUT_HEIGHT,
                },
              ]}
            />

            {isGenerating ? (
              <AnimatedPressable
                onPress={() => {
                  void triggerHaptic('medium');
                  onStop?.();
                }}
                onPressIn={() => {
                  sendScale.value = withSpring(0.85, { damping: 15, stiffness: 300 });
                }}
                onPressOut={() => {
                  sendScale.value = withSpring(1, { damping: 12, stiffness: 200 });
                }}
                className="items-center justify-center rounded-full"
                style={[
                  sendAnimatedStyle,
                  styles.sendButton,
                  { backgroundColor: themeColors.error },
                ]}
              >
                <Square size={11} fill="#fff" color="#fff" />
              </AnimatedPressable>
            ) : (
              <AnimatedPressable
                onPress={handleSend}
                disabled={!canSend}
                onPressIn={() => {
                  sendScale.value = withSpring(0.85, { damping: 15, stiffness: 300 });
                }}
                onPressOut={() => {
                  sendScale.value = withSpring(1, { damping: 12, stiffness: 200 });
                }}
                className="items-center justify-center rounded-full"
                style={[
                  sendAnimatedStyle,
                  styles.sendButton,
                  {
                    backgroundColor: canSend ? themeColors.primary : `${themeColors.border}50`,
                  },
                ]}
              >
                <Send
                  size={15}
                  color={canSend ? '#fff' : themeColors.textMuted}
                  style={{ marginLeft: -1 }}
                />
              </AnimatedPressable>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    paddingLeft: SHELL_PADDING_H,
    paddingRight: SHELL_PADDING_V,
    paddingVertical: SHELL_PADDING_V,
    gap: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: LINE_HEIGHT,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 2,
    paddingRight: 4,
    textAlignVertical: 'center',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  sendButton: {
    width: SEND_BUTTON_SIZE,
    height: SEND_BUTTON_SIZE,
    marginBottom: Platform.OS === 'ios' ? -1 : 0,
  },
});

function getActiveMentionQuery(text: string, selection: TextSelection): ActiveMentionQuery | null {
  if (selection.start !== selection.end) return null;

  const cursor = selection.start;
  const beforeCursor = text.slice(0, cursor);
  const mentionStart = beforeCursor.lastIndexOf('@');

  if (mentionStart < 0) return null;

  const charBeforeMention = text[mentionStart - 1] ?? '';
  if (mentionStart > 0 && !isMentionBoundaryStart(charBeforeMention)) return null;

  const mentionEnd = findMentionEnd(text, mentionStart + 1);
  if (cursor > mentionEnd) return null;

  const query = text.slice(mentionStart + 1, mentionEnd);
  if (/[,\n;!?]/.test(query)) return null;
  if (query.endsWith(' ')) return null;

  return {
    start: mentionStart,
    end: mentionEnd,
    query,
  };
}

function findMentionEnd(text: string, start: number): number {
  let index = start;

  while (index < text.length) {
    const char = text[index];
    if (char === '\n' || char === ',' || char === ';' || char === '!' || char === '?') {
      break;
    }
    index += 1;
  }

  return index;
}

function isMentionBoundaryStart(char: string): boolean {
  return /\s|[([{'"`]/.test(char);
}

function normalizeMentionSearch(value: string): string {
  return value.trim().replace(/^@+/, '').toLowerCase();
}

function getMentionMatchScore(option: ChatInputMentionOption, normalizedQuery: string): number {
  if (!normalizedQuery) return option.type === 'account' ? 0 : 1;

  const normalizedLabel = option.label.toLowerCase();
  const normalizedSubtitle = option.subtitle?.toLowerCase() ?? '';

  if (normalizedLabel === normalizedQuery) return 0;
  if (normalizedLabel.startsWith(normalizedQuery)) return 1;
  if (normalizedLabel.includes(normalizedQuery)) return 2;
  if (normalizedSubtitle.includes(normalizedQuery)) return 3;
  return Number.POSITIVE_INFINITY;
}
