import Twilio from "twilio";

type TwilioClient = ReturnType<typeof Twilio>;

const globalForTwilio = globalThis as unknown as {
  twilio: TwilioClient | undefined;
};

function getClient(): TwilioClient {
  if (!globalForTwilio.twilio) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      throw new Error(
        "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables are required",
      );
    }
    globalForTwilio.twilio = Twilio(accountSid, authToken);
  }
  return globalForTwilio.twilio;
}

export const twilioClient = new Proxy({} as TwilioClient, {
  get(_target, prop) {
    return Reflect.get(getClient(), prop);
  },
});

export function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const conversationsServiceSid = process.env.TWILIO_CONVERSATIONS_SERVICE_SID;

  if (!accountSid || !apiKeySid || !apiKeySecret || !conversationsServiceSid) {
    throw new Error(
      "Twilio environment variables are required: TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_CONVERSATIONS_SERVICE_SID",
    );
  }

  return { accountSid, apiKeySid, apiKeySecret, conversationsServiceSid };
}
