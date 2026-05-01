
import logging
from typing import Optional

import resend

from config import settings

logger = logging.getLogger("oikos.email")


class EmailDeliveryError(RuntimeError):
    """Raised when an invitation email cannot be delivered."""


_ROLE_DISPLAY = {
    "canton_admin": "Canton Administrator",
    "canton_viewer": "Canton Viewer",
}


def _build_invitation_html(role: str, canton_code: Optional[str], setup_url: str) -> str:
    role_display = _ROLE_DISPLAY.get(role, role)
    canton_badge = (
        f'<span style="display:inline-block;margin-left:8px;padding:2px 10px;'
        f'background-color:#e8f5ee;color:#2a6e4b;border-radius:20px;'
        f'font-size:12px;font-weight:600;letter-spacing:0.3px;">{canton_code}</span>'
        if canton_code else ""
    )
    expire_days = settings.INVITATION_TOKEN_EXPIRE_DAYS

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Oikos Invitation</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f2f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f0;padding:48px 20px 64px 20px;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table width="560" cellpadding="0" cellspacing="0"
               style="max-width:560px;width:100%;background-color:#ffffff;
                      border-radius:12px;overflow:hidden;
                      box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header bar with logo area -->
          <tr>
            <td style="background:linear-gradient(135deg,#2a6e4b 0%,#1f5438 100%);
                       padding:36px 48px 32px 48px;">
              <!-- Wordmark -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <!-- Leaf icon (SVG inline) -->
                    <img src="https://em-content.zobj.net/source/google/387/seedling_1f331.png"
                         width="28" height="28" alt=""
                         style="display:block;vertical-align:middle;" />
                  </td>
                  <td style="padding-left:10px;vertical-align:middle;">
                    <span style="font-size:22px;font-weight:700;color:#ffffff;
                                 letter-spacing:0.5px;line-height:1;">Oikos</span>
                  </td>
                </tr>
              </table>
              <!-- Tagline -->
              <p style="margin:12px 0 0 0;font-size:13px;color:rgba(255,255,255,0.65);
                        letter-spacing:0.2px;">
                Solar roof potential platform
              </p>
            </td>
          </tr>

          <!-- Divider accent -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#4caf82,#2a6e4b,#1a4a32);"></td>
          </tr>

          <!-- Main body -->
          <tr>
            <td style="padding:44px 48px 36px 48px;">

              <!-- Greeting -->
              <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;
                         color:#111111;line-height:1.3;">
                You've been invited&nbsp;👋
              </h1>
              <p style="margin:0 0 28px 0;font-size:15px;line-height:1.7;color:#444444;">
                Someone on the Oikos team has created an account for you.
                You'll join as:
              </p>

              <!-- Role card -->
              <table cellpadding="0" cellspacing="0" width="100%"
                     style="margin-bottom:32px;">
                <tr>
                  <td style="background-color:#f7faf8;border-left:4px solid #2a6e4b;
                             border-radius:0 8px 8px 0;padding:16px 20px;">
                    <p style="margin:0 0 4px 0;font-size:11px;font-weight:600;
                               color:#2a6e4b;letter-spacing:1px;text-transform:uppercase;">
                      Your role
                    </p>
                    <p style="margin:0;font-size:16px;font-weight:600;color:#111111;">
                      {role_display}{canton_badge}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Instructions -->
              <p style="margin:0 0 28px 0;font-size:15px;line-height:1.7;color:#444444;">
                Click the button below to choose your password and activate your account.
                This link is <strong>personal</strong> — please do not share it.
              </p>

              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:36px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#2a6e4b,#1f5438);
                             border-radius:8px;
                             box-shadow:0 3px 10px rgba(42,110,75,0.35);">
                    <a href="{setup_url}"
                       style="display:inline-block;padding:15px 36px;
                              color:#ffffff;font-size:15px;font-weight:600;
                              text-decoration:none;border-radius:8px;
                              letter-spacing:0.2px;">
                      Set up my account &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiry notice -->
              <table cellpadding="0" cellspacing="0" width="100%"
                     style="margin-bottom:28px;">
                <tr>
                  <td style="background-color:#fffbf0;border:1px solid #f5e9c8;
                             border-radius:8px;padding:12px 16px;">
                    <p style="margin:0;font-size:13px;color:#7a5c00;line-height:1.5;">
                      ⏳&nbsp; This link expires in <strong>{expire_days} days</strong>.
                      If it has expired, contact your administrator to send a new invitation.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Fallback URL -->
              <p style="margin:0 0 6px 0;font-size:12px;color:#888888;">
                Button not working? Copy and paste this link into your browser:
              </p>
              <p style="margin:0;font-size:12px;word-break:break-all;">
                <a href="{setup_url}" style="color:#2a6e4b;text-decoration:underline;">{setup_url}</a>
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 48px 28px 48px;border-top:1px solid #eeeeee;
                       background-color:#fafafa;">
              <p style="margin:0;font-size:12px;color:#aaaaaa;line-height:1.7;">
                If you did not expect this invitation, you can safely ignore this email.
                Your account will not be activated until you complete the setup.
              </p>
            </td>
          </tr>

        </table>
        <!-- End card -->

        <!-- Below-card note -->
        <p style="margin:24px 0 0 0;font-size:12px;color:#999999;text-align:center;">
          &copy; Oikos &mdash; Solar Roof Potential Platform
        </p>

      </td>
    </tr>
  </table>

</body>
</html>"""


def send_invitation_email(
    to_email: str,
    setup_url: str,
    role: str,
    canton_code: Optional[str] = None,
) -> None:
    """
    Send an invitation email via Resend.

    Raises EmailDeliveryError if sending fails (misconfigured key,
    network error, Resend API error, etc.).
    """
    if not settings.RESEND_API_KEY:
        logger.error(
            "EMAIL invitation skipped — RESEND_API_KEY is not configured "
            "to=%s role=%s canton=%s",
            to_email, role, canton_code,
        )
        raise EmailDeliveryError("RESEND_API_KEY is not configured")

    resend.api_key = settings.RESEND_API_KEY

    role_display = _ROLE_DISPLAY.get(role, role)
    subject = f"You have been invited to Oikos as {role_display}"

    html_content = _build_invitation_html(role, canton_code, setup_url)

    params: resend.Emails.SendParams = {
        "from": settings.EMAIL_FROM_ADDRESS,
        "to": [to_email],
        "subject": subject,
        "html": html_content,
    }

    try:
        result = resend.Emails.send(params)
        email_id = result.get("id") if isinstance(result, dict) else getattr(result, "id", None)
        logger.info(
            "EMAIL invitation sent to=%s role=%s canton=%s resend_id=%s",
            to_email, role, canton_code, email_id,
        )
    except Exception as exc:
        logger.error(
            "EMAIL invitation failed to=%s role=%s canton=%s error_type=%s error=%s",
            to_email, role, canton_code, type(exc).__name__, exc,
        )
        raise EmailDeliveryError(str(exc)) from exc
