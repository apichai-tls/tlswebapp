/**
 * Beam Checkout Payment Gateway Service
 * Handles communication with Beam API for online payments.
 */

export interface CreatePaymentLinkParams {
  referenceId: string;
  amount: number; // in THB, e.g. 150.00
  description?: string;
  redirectUrl?: string;
  customerPhone?: string;
  orderItems?: Array<{
    itemName: string;
    price: number; // in satang
    quantity: number;
    description?: string;
  }>;
}

export interface BeamPaymentLinkResponse {
  id: string;
  url: string;
}

export interface BeamApiResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

function getBeamConfig() {
  const merchantId = process.env.BEAM_MERCHANT_ID || 'thatlaundryshop-0yf371';
  const apiKey = process.env.BEAM_API_KEY || 'PwPOMzqGWp+v66fpLu0meKrj+Xiz6PWKIgVNo7qtxzc=';
  const baseUrl = process.env.BEAM_API_BASE_URL || 'https://api.beamcheckout.com';

  const basicAuth = Buffer.from(`${merchantId}:${apiKey}`).toString('base64');
  const authHeader = `Basic ${basicAuth}`;

  return { merchantId, apiKey, baseUrl, authHeader };
}

/**
 * Create a hosted Beam Payment Link (supports Credit Card, PromptPay, Mobile Banking)
 */
export async function createBeamPaymentLink(
  params: CreatePaymentLinkParams
): Promise<BeamApiResult<BeamPaymentLinkResponse>> {
  try {
    const { baseUrl, authHeader } = getBeamConfig();
    const netAmountSatang = Math.round(params.amount * 100);

    const payload: any = {
      order: {
        currency: 'THB',
        description: params.description || `Order #${params.referenceId}`,
        netAmount: netAmountSatang,
        referenceId: params.referenceId,
      },
      linkSettings: {
        card: { isEnabled: true },
        qrPromptPay: { isEnabled: true },
        mobileBanking: { isEnabled: true },
        eWallets: { isEnabled: false },
        buyNowPayLater: { isEnabled: false },
      },
    };

    if (params.redirectUrl) {
      payload.redirectUrl = params.redirectUrl;
    }

    if (params.orderItems && params.orderItems.length > 0) {
      payload.order.orderItems = params.orderItems;
    }

    const response = await fetch(`${baseUrl}/api/v1/payment-links`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const resData = await response.json();

    if (!response.ok || !resData.id) {
      console.error('[Beam API] Create Payment Link failed:', resData);
      return {
        success: false,
        error: resData.message || resData.error?.errorMessage || `HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      data: {
        id: resData.id,
        url: resData.url,
      },
    };
  } catch (err: any) {
    console.error('[Beam API] Exception creating payment link:', err);
    return {
      success: false,
      error: err.message || 'Failed to connect to Beam Payment Gateway',
    };
  }
}

/**
 * Check charge status directly from Beam API
 */
export async function getBeamChargesByReference(referenceId: string): Promise<BeamApiResult<any[]>> {
  try {
    const { baseUrl, authHeader } = getBeamConfig();

    const response = await fetch(`${baseUrl}/api/v1/charges`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const resData = await response.json();
    const allCharges = resData.data || [];
    
    // Filter by referenceId
    const matching = allCharges.filter((c: any) => 
      c.referenceId === referenceId || 
      c.reference_id === referenceId ||
      c.customer?.referenceId === referenceId
    );

    return {
      success: true,
      data: matching,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Disable a Beam Payment Link
 */
export async function disableBeamPaymentLink(paymentLinkId: string): Promise<boolean> {
  try {
    const { baseUrl, authHeader } = getBeamConfig();
    const response = await fetch(`${baseUrl}/api/v1/payment-links/${paymentLinkId}/disable`, {
      method: 'PATCH',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}
