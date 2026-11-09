'use client';

import { useEffect, useRef } from 'react';
import { DeviceFrame } from './DeviceFrame';
import { APP_STORE_COPY } from '../scenes/appStoreCreativeCopy';
import { screenshotLocale } from '../scenes/locales';
import { animation, paymentKeyframes } from '../data/paymentAnimation.mjs';
import { faceIdSvg } from '../data/faceIdAnimation.mjs';
import styles from './PaymentAutomationPreview.module.css';

function Contactless({ size = 42 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" aria-hidden="true">
    <path d="M17 18a11 11 0 0 1 0 12M23 12a20 20 0 0 1 0 24M29 6a29 29 0 0 1 0 36" />
  </svg>;
}
function Check({ size = 54 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 60 60" fill="none" aria-hidden="true"><circle cx="30" cy="30" r="27" stroke="currentColor" strokeWidth="3" /><path d="m17 30 9 9 17-18" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function FaceIdIsland() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let handle = 0;
    let lastFrame = -1;
    const tick = () => {
      const element = ref.current;
      if (!element) return;
      // Read the shared CSS clock so pause, Replay and reduced motion stay aligned.
      const clock = element.closest('[data-payment-motion]')?.getAnimations()[0];
      const time = Number(clock?.currentTime ?? 0) / 1000;
      const frame = Math.min(animation.duration * animation.fps, Math.floor(time * animation.fps));
      if (frame !== lastFrame) {
        element.innerHTML = faceIdSvg(frame / animation.fps);
        lastFrame = frame;
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, []);
  const config = animation.faceId;
  return <div ref={ref} data-payment-generated="faceid" className={styles.faceIdIsland} aria-hidden="true"
    style={{ left: config.left, top: config.top, width: config.width * config.unitScale, height: config.height * config.unitScale }}
    dangerouslySetInnerHTML={{ __html: faceIdSvg(0) }} />;
}

/** Shared payment hardware transitions into the app's existing localized ledger. */
export function PaymentAutomationPreview({ locale, animate = true }: { locale: string; animate?: boolean }) {
  const copy = (APP_STORE_COPY[locale] ?? APP_STORE_COPY.en).payment;
  const screenLocale = screenshotLocale(locale);
  const amount = animation.amounts[screenLocale as keyof typeof animation.amounts];
  const screenshot = `/assets/screenshots-iphone/${screenLocale}/01-home.png`;
  return <div className={styles.scene} data-payment-animate={animate} style={{
    '--payment-duration': `${animation.duration}s`,
    '--payment-phone-left': `${animation.phone.left}px`, '--payment-phone-top': `${animation.phone.top}px`,
    '--payment-phone-scale': animation.phone.scale,
    '--payment-phone-capture-x': `${animation.phone.x}px`, '--payment-phone-capture-y': `${animation.phone.y}px`,
    '--payment-terminal-left': `${animation.terminal.left}px`, '--payment-terminal-top': `${animation.terminal.top}px`,
    '--ledger-entry-top': `${animation.ledger.entryTop / animation.ledger.sourceHeight * 100}%`,
    '--ledger-entry-height': `${animation.ledger.entryHeight / animation.ledger.sourceHeight * 100}%`,
    '--ledger-entry-offset': `${-animation.ledger.screen.height * animation.ledger.entryTop / animation.ledger.sourceHeight}px`,
    '--ledger-older-offset': `${-animation.ledger.screen.height * (animation.ledger.entryTop + animation.ledger.entryHeight) / animation.ledger.sourceHeight}px`,
    '--ledger-flash-left': `${animation.ledger.flash.left / animation.ledger.sourceWidth * animation.ledger.screen.width}px`,
    '--ledger-flash-top': `${(animation.ledger.flash.top - animation.ledger.entryTop) / animation.ledger.sourceHeight * animation.ledger.screen.height}px`,
    '--ledger-flash-width': `${animation.ledger.flash.width / animation.ledger.sourceWidth * animation.ledger.screen.width}px`,
    '--ledger-flash-height': `${animation.ledger.flash.height / animation.ledger.sourceHeight * animation.ledger.screen.height}px`,
    '--ledger-flash-radius': `${animation.ledger.flash.radius / animation.ledger.sourceWidth * animation.ledger.screen.width}px`,
    '--ledger-flash-image-left': `${-animation.ledger.flash.left / animation.ledger.sourceWidth * animation.ledger.screen.width}px`,
    '--ledger-flash-image-top': `${-animation.ledger.flash.top / animation.ledger.sourceHeight * animation.ledger.screen.height}px`,
    '--ledger-flash-color': animation.ledger.flash.color,
  } as React.CSSProperties}>
    <style>{paymentKeyframes()}</style>
    <div className={styles.terminalPose}>
      <div className={styles.terminalSide} data-payment-static />
      <div className={styles.terminal} data-payment-static>
        <div className={styles.paymentMarks}>
          <div className={styles.visaMark}><img src="/assets/app-store/payment/visa-mark.svg" alt="Visa" /></div>
          <img className={styles.terminalApplePay} src="/assets/app-store/payment/apple-pay-mark.svg" alt="Apple Pay" />
        </div>
        <div className={styles.reader}><Contactless size={78} /></div>
        <div className={styles.terminalScreen}>
          <span className={styles.terminalAmount} style={{ fontSize: Math.min(77, 580 / amount.length) }}>{amount}</span>
          <Contactless size={64} />
        </div>
        <div className={styles.keypad}>{Array.from({ length: 9 }, (_, i) => <span key={i}>{i + 1}</span>)}<span className={styles.cancel} /><span>0</span><span className={styles.confirm} /></div>
        <div className={styles.terminalLip} />
      </div>
      <div data-payment-layer="approved" className={`${styles.approved} ${styles.phase}`} style={{ animationName: 'payment-approved' }}>
        <Check size={106} />
      </div>
    </div>
    <div className={styles.phoneMotion} data-payment-motion style={{ animationName: 'payment-phone' }}>
      <div className={styles.phonePose}>
        <div data-payment-layer="phone" className={styles.phone}>
          <div className={styles.phoneSide} />
          <DeviceFrame scale={2.75}>
            <div className={styles.screen} style={{ transform: 'scale(2.75)', transformOrigin: 'top left' }}>
              <div className={styles.status}><span>9:41</span><svg width="57" height="14" viewBox="0 0 63 16" fill="currentColor" aria-hidden="true">
                <rect x="0" y="10" width="3" height="5" rx="1" /><rect x="5" y="7" width="3" height="8" rx="1" /><rect x="10" y="4" width="3" height="11" rx="1" /><rect x="15" y="1" width="3" height="14" rx="1" />
                <path d="M23 5q8-7 16 0m-13 4q5-4 10 0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /><circle cx="31" cy="13" r="1.8" />
                <rect x="43" y="2" width="17" height="12" rx="3" /><rect x="61" y="6" width="2" height="4" rx="1" />
              </svg></div>
              <div className={styles.island} />
              <div className={styles.applePay}><img src="/logos/global/apple-pay.png" alt="Apple" /><span>Pay</span></div>
              <div className={styles.bankCard}>
                <div className={styles.cardTop}><span className={styles.chip} /><Contactless size={30} /></div>
                <span className={styles.cardNumber}>•••• {animation.cardLastFour}</span>
              </div>
              <div className={styles.amount} style={{ fontSize: Math.min(38, 480 / amount.length) }}>{amount}</div>
              <div className={styles.tap}>{copy.tap}</div>
              <div className={styles.homeIndicator} />
            </div>
          </DeviceFrame>
        </div>
        <FaceIdIsland />
        <div data-payment-layer="paid" className={`${styles.paid} ${styles.phase}`} style={{ animationName: 'payment-paid' }}>
          <Check size={96} /><span>{copy.done}</span>
        </div>
        <div data-payment-layer="logged" className={`${styles.ledgerScreen} ${styles.phase}`} style={{ animationName: 'payment-logged' }}>
          <img className={styles.ledgerImage} src={screenshot} alt="" />
          <div className={styles.ledgerIsland} />
          <div className={styles.ledgerBodyMask} />
        </div>
        <div data-payment-layer="existing" className={`${styles.ledgerScreen} ${styles.phase}`} style={{ animationName: 'payment-existing' }}>
          <div className={styles.ledgerBody}>
            <div className={styles.olderRows} style={{ animationName: 'payment-insert' }}><img className={styles.olderImage} src={screenshot} alt="" /></div>
          </div>
        </div>
        <div data-payment-layer="transaction" className={`${styles.ledgerScreen} ${styles.phase}`} style={{ animationName: 'payment-transaction' }}>
          <div className={`${styles.entryCrop} ${styles.entryReveal}`} style={{ animationName: 'payment-entry-reveal' }}>
            <img className={styles.entryImage} src={screenshot} alt="" />
          </div>
        </div>
        <div data-payment-layer="flash" className={`${styles.ledgerScreen} ${styles.phase}`} style={{ animationName: 'payment-flash' }}>
          <div className={`${styles.entryCrop} ${styles.entryReveal}`} style={{ animationName: 'payment-entry-reveal' }}>
            <div className={styles.rowFlash}>
              <img className={styles.flashOriginal} src={screenshot} alt="" />
              <div className={styles.flashTint} />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>;
}
