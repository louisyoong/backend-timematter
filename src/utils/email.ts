import * as net from 'net';
import * as tls from 'tls';

function b64(s: string): string {
    return Buffer.from(s).toString('base64');
}

/**
 * Sends an email via SMTP with STARTTLS (works with Brevo, Gmail, Outlook, etc.)
 * Configure via environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */
function sendSmtpEmail(to: string, subject: string, html: string): Promise<void> {
    const host = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';
    const from = process.env.SMTP_FROM || user;

    if (!user || !pass) {
        return Promise.reject(new Error('SMTP_USER and SMTP_PASS must be set in .env'));
    }

    // Build RFC 2822 message
    const message = [
        `From: TimeMatter <${from}>`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/html; charset=UTF-8`,
        ``,
        html,
    ].join('\r\n');

    return new Promise((resolve, reject) => {
        let step = 0;
        let tlsSocket: tls.TLSSocket | null = null;
        let buf = '';

        const write = (cmd: string) => {
            const sock = tlsSocket || socket;
            sock.write(cmd + '\r\n');
        };

        const onData = (raw: string) => {
            buf += raw;

            let idx: number;
            while ((idx = buf.indexOf('\r\n')) !== -1) {
                const line = buf.substring(0, idx);
                buf = buf.substring(idx + 2);

                // Skip multi-line continuation (e.g. "250-SIZE 10000000")
                if (/^\d{3}-/.test(line)) continue;

                const code = parseInt(line.substring(0, 3), 10);
                if (isNaN(code)) continue;

                if (code >= 400) {
                    socket.destroy();
                    return reject(new Error(`SMTP error ${code}: ${line}`));
                }

                switch (step) {
                    case 0: // 220 greeting
                        if (code === 220) { write(`EHLO localhost`); step = 1; }
                        break;
                    case 1: // 250 EHLO — request STARTTLS
                        if (code === 250) { write('STARTTLS'); step = 2; }
                        break;
                    case 2: // 220 ready to upgrade
                        if (code === 220) {
                            tlsSocket = tls.connect({ socket, servername: host }, () => {
                                write(`EHLO localhost`);
                                step = 3;
                            });
                            tlsSocket.on('data', (d: Buffer) => onData(d.toString()));
                            tlsSocket.on('error', (e: Error) => { socket.destroy(); reject(e); });
                        }
                        break;
                    case 3: // 250 TLS EHLO — AUTH LOGIN
                        if (code === 250) { write('AUTH LOGIN'); step = 4; }
                        break;
                    case 4: // 334 username prompt
                        if (code === 334) { write(b64(user)); step = 5; }
                        break;
                    case 5: // 334 password prompt
                        if (code === 334) { write(b64(pass)); step = 6; }
                        break;
                    case 6: // 235 auth success
                        if (code === 235) { write(`MAIL FROM:<${from}>`); step = 7; }
                        break;
                    case 7: // 250 MAIL FROM accepted
                        if (code === 250) { write(`RCPT TO:<${to}>`); step = 8; }
                        break;
                    case 8: // 250 RCPT TO accepted
                        if (code === 250) { write('DATA'); step = 9; }
                        break;
                    case 9: // 354 ready for data
                        if (code === 354) { write(message + '\r\n.'); step = 10; }
                        break;
                    case 10: // 250 message queued
                        if (code === 250) { write('QUIT'); step = 11; }
                        break;
                    case 11: // 221 bye
                        socket.destroy();
                        resolve();
                        break;
                }
            }
        };

        const socket = net.connect(port, host);
        socket.on('data', (d: Buffer) => { if (!tlsSocket) onData(d.toString()); });
        socket.on('error', (e: Error) => reject(e));
        socket.setTimeout(30000, () => {
            socket.destroy();
            reject(new Error('SMTP connection timed out'));
        });
    });
}

export function sendVerificationEmail(to: string, verificationUrl: string): Promise<void> {
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">Verify Your Email Address</h2>
            <p>Thanks for signing up! Before you can log in, please verify your email address by clicking the button below.</p>
            <div style="text-align: center; margin: 32px 0;">
                <a href="${verificationUrl}"
                   style="display: inline-block; padding: 14px 28px; background-color: #4F46E5;
                          color: white; text-decoration: none; border-radius: 8px; font-size: 16px;">
                    Verify My Email
                </a>
            </div>
            <p style="color: #555;">Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #4F46E5;">${verificationUrl}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #999; font-size: 12px;">
                This link expires in 24 hours. If you did not create an account, you can safely ignore this email.
            </p>
        </div>
    `;
    return sendSmtpEmail(to, 'Verify Your Email Address', html);
}
