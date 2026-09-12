import { Image, useImage } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AccessibilityActionEvent, LayoutChangeEvent } from 'react-native';
import { ActivityIndicator, Alert, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Button, Text } from '~/components/ui';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cropReceiptImage } from '~/services/receiptImage';
import {
  containedImageFrame,
  type CropHandle,
  cropPixelsFromDisplayRect,
  type CropRect,
  type CropSize,
  hasCropChanged,
  resizeCropRect,
} from '~/utils/receiptCrop';

interface ReceiptCropEditorProps {
  fileUri: string;
  onCancel: () => void;
  onSave: (croppedFileUri: string) => void | Promise<void>;
  onSavingChange?: (saving: boolean) => void;
}

const HANDLE_TOUCH_SIZE = 44;
const HANDLE_DOT_SIZE = 18;
const MINIMUM_CROP_SIZE = 64;
const MASK_COLOR = 'rgba(0,0,0,0.62)';

type CropGesture = React.ComponentProps<typeof GestureDetector>['gesture'];

const CROP_HANDLE_LABEL_KEYS: Record<CropHandle, string> = {
  topLeft: 'transactions.editor.receipt.crop_top_left',
  topRight: 'transactions.editor.receipt.crop_top_right',
  bottomLeft: 'transactions.editor.receipt.crop_bottom_left',
  bottomRight: 'transactions.editor.receipt.crop_bottom_right',
};

function CropHandleControl({
  handle,
  crop,
  gesture,
  onAdjust,
}: {
  handle: CropHandle;
  crop: CropRect;
  gesture: CropGesture;
  onAdjust: (handle: CropHandle, direction: 'expand' | 'contract') => void;
}) {
  const right = handle === 'topRight' || handle === 'bottomRight';
  const bottom = handle === 'bottomLeft' || handle === 'bottomRight';
  return (
    <GestureDetector gesture={gesture}>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={I18n.t(CROP_HANDLE_LABEL_KEYS[handle])}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event: AccessibilityActionEvent) => {
          if (event.nativeEvent.actionName === 'increment') {
            onAdjust(handle, 'expand');
          } else if (event.nativeEvent.actionName === 'decrement') {
            onAdjust(handle, 'contract');
          }
        }}
        style={{
          position: 'absolute',
          left: (right ? crop.x + crop.width : crop.x) - HANDLE_TOUCH_SIZE / 2,
          top: (bottom ? crop.y + crop.height : crop.y) - HANDLE_TOUCH_SIZE / 2,
          width: HANDLE_TOUCH_SIZE,
          height: HANDLE_TOUCH_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: HANDLE_DOT_SIZE,
            height: HANDLE_DOT_SIZE,
            borderRadius: HANDLE_DOT_SIZE / 2,
            borderWidth: 2,
            borderColor: '#000000',
            backgroundColor: '#FFFFFF',
          }}
        />
      </View>
    </GestureDetector>
  );
}

/** Freeform receipt cropper used by both the transaction editor and Receipts library. */
export function ReceiptCropEditor({
  fileUri,
  onCancel,
  onSave,
  onSavingChange,
}: ReceiptCropEditorProps) {
  const [container, setContainer] = useState<CropSize>({ width: 0, height: 0 });
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const inFlightRef = useRef(false);
  const cropRef = useRef<CropRect | null>(null);
  const dragStartRef = useRef<CropRect | null>(null);

  useEffect(() => setLoadFailed(false), [fileUri]);
  const loadedImage = useImage(fileUri, {
    onError: () => setLoadFailed(true),
  });
  const imageSize = useMemo<CropSize | null>(
    () =>
      loadedImage
        ? {
            width: Math.max(1, Math.round(loadedImage.width * loadedImage.scale)),
            height: Math.max(1, Math.round(loadedImage.height * loadedImage.scale)),
          }
        : null,
    [loadedImage],
  );
  const imageFrame = useMemo(
    () => (imageSize ? containedImageFrame(container, imageSize) : null),
    [container, imageSize],
  );

  useEffect(() => {
    setCrop(imageFrame);
    cropRef.current = imageFrame;
  }, [imageFrame]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainer((previous) =>
      previous.width === width && previous.height === height ? previous : { width, height },
    );
  }, []);

  const beginDrag = useCallback(() => {
    dragStartRef.current = cropRef.current;
    void triggerHaptic('selection');
  }, []);

  const moveHandle = useCallback(
    (handle: CropHandle, translationX: number, translationY: number) => {
      const start = dragStartRef.current;
      if (!start || !imageFrame) return;
      const next = resizeCropRect(
        start,
        imageFrame,
        handle,
        translationX,
        translationY,
        MINIMUM_CROP_SIZE,
      );
      cropRef.current = next;
      setCrop(next);
    },
    [imageFrame],
  );

  const gestures = useMemo(() => {
    const forHandle = (handle: CropHandle) =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin(beginDrag)
        .onUpdate((event) => moveHandle(handle, event.translationX, event.translationY));
    return {
      topLeft: forHandle('topLeft'),
      topRight: forHandle('topRight'),
      bottomLeft: forHandle('bottomLeft'),
      bottomRight: forHandle('bottomRight'),
    };
  }, [beginDrag, moveHandle]);

  const adjustHandle = useCallback(
    (handle: CropHandle, direction: 'expand' | 'contract') => {
      const current = cropRef.current;
      if (!current || !imageFrame) return;
      const right = handle === 'topRight' || handle === 'bottomRight';
      const bottom = handle === 'bottomLeft' || handle === 'bottomRight';
      const distance = direction === 'expand' ? 8 : -8;
      const next = resizeCropRect(
        current,
        imageFrame,
        handle,
        right ? distance : -distance,
        bottom ? distance : -distance,
        MINIMUM_CROP_SIZE,
      );
      cropRef.current = next;
      setCrop(next);
      void triggerHaptic('selection');
    },
    [imageFrame],
  );

  const cropChanged = !!crop && !!imageFrame && hasCropChanged(crop, imageFrame);
  const handleSave = useCallback(async () => {
    if (inFlightRef.current || !crop || !imageFrame || !imageSize || !cropChanged) return;
    inFlightRef.current = true;
    setSaving(true);
    onSavingChange?.(true);
    try {
      const pixels = cropPixelsFromDisplayRect(imageSize, imageFrame, crop);
      const croppedFileUri = await cropReceiptImage(fileUri, pixels);
      await onSave(croppedFileUri);
      void triggerHaptic('success');
    } catch {
      Alert.alert(I18n.t('transactions.editor.receipt.crop_failed'));
      inFlightRef.current = false;
      setSaving(false);
      onSavingChange?.(false);
    }
  }, [crop, cropChanged, fileUri, imageFrame, imageSize, onSave, onSavingChange]);

  return (
    <View className="flex-1">
      <View className="m-6 flex-1" onLayout={handleLayout}>
        {loadedImage && imageFrame && crop ? (
          <>
            <Image
              source={loadedImage}
              style={{ position: 'absolute', inset: 0 }}
              contentFit="contain"
            />

            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: imageFrame.x,
                top: imageFrame.y,
                width: imageFrame.width,
                height: Math.max(0, crop.y - imageFrame.y),
                backgroundColor: MASK_COLOR,
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: imageFrame.x,
                top: crop.y + crop.height,
                width: imageFrame.width,
                height: Math.max(0, imageFrame.y + imageFrame.height - crop.y - crop.height),
                backgroundColor: MASK_COLOR,
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: imageFrame.x,
                top: crop.y,
                width: Math.max(0, crop.x - imageFrame.x),
                height: crop.height,
                backgroundColor: MASK_COLOR,
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: crop.x + crop.width,
                top: crop.y,
                width: Math.max(0, imageFrame.x + imageFrame.width - crop.x - crop.width),
                height: crop.height,
                backgroundColor: MASK_COLOR,
              }}
            />

            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: crop.x,
                top: crop.y,
                width: crop.width,
                height: crop.height,
                borderWidth: 1.5,
                borderColor: '#FFFFFF',
              }}
            >
              <View className="absolute inset-y-0 left-1/3 w-px bg-white/35" />
              <View className="absolute inset-y-0 right-1/3 w-px bg-white/35" />
              <View className="absolute inset-x-0 top-1/3 h-px bg-white/35" />
              <View className="absolute inset-x-0 bottom-1/3 h-px bg-white/35" />
            </View>

            <CropHandleControl
              handle="topLeft"
              crop={crop}
              gesture={gestures.topLeft}
              onAdjust={adjustHandle}
            />
            <CropHandleControl
              handle="topRight"
              crop={crop}
              gesture={gestures.topRight}
              onAdjust={adjustHandle}
            />
            <CropHandleControl
              handle="bottomLeft"
              crop={crop}
              gesture={gestures.bottomLeft}
              onAdjust={adjustHandle}
            />
            <CropHandleControl
              handle="bottomRight"
              crop={crop}
              gesture={gestures.bottomRight}
              onAdjust={adjustHandle}
            />
          </>
        ) : (
          <View className="flex-1 items-center justify-center">
            {loadFailed ? (
              <Text className="text-white/65">
                {I18n.t('transactions.editor.receipt.crop_load_failed')}
              </Text>
            ) : (
              <ActivityIndicator color="#FFFFFF" />
            )}
          </View>
        )}
      </View>

      <Text variant="caption" className="px-5 pb-3 pt-4 text-center text-white/65">
        {I18n.t('transactions.editor.receipt.crop_hint')}
      </Text>
      <View className="flex-row gap-3 px-5 pb-4">
        <Button
          className="flex-1 border-white/20 bg-white/10"
          variant="secondary"
          onPress={onCancel}
          disabled={saving}
        >
          <Text variant="bodyStrong" className="text-white">
            {I18n.t('common.cancel')}
          </Text>
        </Button>
        <Button
          className="flex-1 bg-white"
          onPress={() => void handleSave()}
          disabled={!cropChanged || saving}
        >
          {saving ? (
            <ActivityIndicator color="#000000" />
          ) : (
            <Text variant="bodyStrong" className="text-black">
              {I18n.t('transactions.editor.receipt.crop')}
            </Text>
          )}
        </Button>
      </View>
    </View>
  );
}
