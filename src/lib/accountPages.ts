// Which Account pages exist on which platform.

/** The iPhone app has no promo code box: Apple wants a subscription's promo codes to be offer codes redeemed through the App Store
 *  (guideline 3.1.1). Android and the web keep it. */
export const promoCodesAllowedOn = (platform: string) => platform !== 'ios';

/** Whether an Account page may open here. A link to #account/promo on an iPhone used to open the page with nothing on it. */
export const accountPageAllowed = (page: string, platform: string) => page !== 'promo' || promoCodesAllowedOn(platform);
