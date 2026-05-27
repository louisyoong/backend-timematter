import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM || 'TimeMatter <onboarding@resend.dev>';

// ─── Join Event Confirmation ──────────────────────────────────────────────────

export async function sendEventConfirmationEmail(
    to: string,
    attendeeName: string,
    event: {
        title: string;
        event_date: string;
        location: string | null;
        category: string | null;
        banner_image_url: string | null;
        organizer_name: string | null;
        event_type?: string;
        online_url?: string | null;
    }
): Promise<void> {
    const formattedDate = new Date(event.event_date).toLocaleString('en-US', {
        weekday: 'long',
        year:    'numeric',
        month:   'long',
        day:     'numeric',
        hour:    '2-digit',
        minute:  '2-digit',
    });

    const bannerHtml = event.banner_image_url
        ? `<img src="${event.banner_image_url}" alt="${event.title}"
               style="width:100%;max-height:220px;object-fit:cover;border-radius:8px;
                      display:block;margin-bottom:24px;" />`
        : '';

    const isOnline = event.event_type === 'online';

    const rows = [
        { icon: '📅', label: 'Date',      value: formattedDate },
        isOnline
            ? { icon: '💻', label: 'Format', value: 'Online Event' }
            : (event.location ? { icon: '📍', label: 'Location', value: event.location } : null),
        event.organizer_name ? { icon: '🎤', label: 'Organizer', value: event.organizer_name } : null,
        event.category     ? { icon: '🏷️', label: 'Category',  value: event.category.charAt(0).toUpperCase() + event.category.slice(1) } : null,
    ].filter(Boolean) as { icon: string; label: string; value: string }[];

    const onlineLinkHtml = isOnline && event.online_url ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr>
            <td style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px 24px;">
              <p style="margin:0 0 6px 0;font-size:13px;font-weight:bold;color:#15803d;
                         text-transform:uppercase;letter-spacing:0.05em;">
                🔗 Online Event Link
              </p>
              <p style="margin:0 0 14px 0;font-size:13px;color:#374151;line-height:1.5;">
                Use the link below to join when the event starts. Keep this email handy!
              </p>
              <a href="${event.online_url}"
                 style="display:inline-block;padding:12px 24px;background:#16a34a;color:#ffffff;
                        text-decoration:none;border-radius:8px;font-size:14px;font-weight:bold;
                        word-break:break-all;">
                Join Event →
              </a>
            </td>
          </tr>
        </table>` : '';

    const tableRows = rows.map(r => `
        <tr>
          <td style="padding:8px 12px 8px 0;white-space:nowrap;vertical-align:top;">
            <span style="font-size:16px;">${r.icon}</span>
          </td>
          <td style="padding:8px 0;color:#374151;font-size:14px;line-height:1.5;">
            <strong style="color:#111827;">${r.label}:</strong>&nbsp;${r.value}
          </td>
        </tr>`).join('');

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0"
             style="max-width:580px;background:#ffffff;border-radius:16px;
                    overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Top bar -->
        <tr>
          <td style="background:#111827;padding:20px 32px;">
            <span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">
              TimeMatter
            </span>
          </td>
        </tr>

        <!-- Content -->
        <tr>
          <td style="padding:32px;">

            ${bannerHtml}

            <!-- Heading -->
            <h1 style="margin:0 0 6px 0;font-size:26px;color:#111827;">You're registered! 🎉</h1>
            <p style="margin:0 0 28px 0;color:#6b7280;font-size:15px;line-height:1.6;">
              Hi <strong style="color:#111827;">${attendeeName || 'there'}</strong>,
              your spot has been confirmed. We can't wait to see you there!
            </p>

            <!-- Event card -->
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:28px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 16px 0;font-size:18px;font-weight:bold;color:#111827;
                             border-bottom:1px solid #e5e7eb;padding-bottom:14px;">
                    ${event.title}
                  </p>
                  <table cellpadding="0" cellspacing="0" width="100%">
                    ${tableRows}
                  </table>
                </td>
              </tr>
            </table>

            ${onlineLinkHtml}

            <!-- CTA note -->
            <p style="color:#6b7280;font-size:14px;margin:0 0 28px 0;line-height:1.6;">
              You can view this and all your upcoming events in the
              <strong style="color:#111827;">My Tickets</strong> section of the TimeMatter app.
            </p>

            <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px 0;" />
            <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">
              You're receiving this email because you joined an event on TimeMatter.
            </p>

          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const { error } = await resend.emails.send({
        from:    FROM,
        to:      [to],
        subject: `You're registered: ${event.title}`,
        html,
    });

    if (error) throw new Error(`Resend: ${error.message}`);
}

// ─── Password Reset ───────────────────────────────────────────────────────────

export async function sendVerificationEmail(to: string, resetUrl: string): Promise<void> {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0"
             style="max-width:580px;background:#ffffff;border-radius:16px;
                    overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#111827;padding:20px 32px;">
            <span style="color:#ffffff;font-size:20px;font-weight:bold;">TimeMatter</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 8px 0;font-size:24px;color:#111827;">Reset your password</h1>
            <p style="color:#6b7280;margin:0 0 28px 0;font-size:15px;line-height:1.6;">
              We received a request to reset your password. Click the button below —
              this link expires in <strong style="color:#111827;">1 hour</strong>.
            </p>
            <a href="${resetUrl}"
               style="display:inline-block;padding:14px 32px;background:#111827;color:#ffffff;
                      text-decoration:none;border-radius:8px;font-size:15px;font-weight:bold;">
              Reset Password
            </a>
            <p style="color:#9ca3af;font-size:12px;margin:28px 0 0 0;">
              If you didn't request this, you can safely ignore this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const { error } = await resend.emails.send({
        from:    FROM,
        to:      [to],
        subject: 'Reset your TimeMatter password',
        html,
    });

    if (error) throw new Error(`Resend: ${error.message}`);
}
