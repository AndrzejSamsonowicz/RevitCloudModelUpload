/**
 * Email Service
 * Handles sending verification and notification emails
 */

const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        // Configure email transporter based on environment
        this.transporter = null;
        this.fromEmail = process.env.EMAIL_FROM || 'noreply@revitpublisher.com';
        this.appUrl = process.env.APP_URL || 'http://localhost:3000';
        
        this.initialize();
    }

    initialize() {
        // Use Gmail, SendGrid, or custom SMTP based on environment variables
        if (process.env.SMTP_HOST) {
            // Custom SMTP server
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });
            console.log('Email service initialized with custom SMTP');
        } else if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
            // Gmail with app password
            this.transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.GMAIL_USER,
                    pass: process.env.GMAIL_APP_PASSWORD
                }
            });
            this.fromEmail = process.env.GMAIL_USER;
            console.log('Email service initialized with Gmail');
        } else if (process.env.SENDGRID_API_KEY) {
            // SendGrid
            this.transporter = nodemailer.createTransport({
                host: 'smtp.sendgrid.net',
                port: 587,
                auth: {
                    user: 'apikey',
                    pass: process.env.SENDGRID_API_KEY
                }
            });
            console.log('Email service initialized with SendGrid');
        } else {
            // Development mode - log to console instead
            console.warn('⚠️  No email service configured. Emails will be logged to console only.');
            console.warn('Configure GMAIL_USER/GMAIL_APP_PASSWORD or SMTP settings in .env');
            this.transporter = {
                sendMail: async (mailOptions) => {
                    console.log('\n📧 ===== EMAIL (DEV MODE) =====');
                    console.log('To:', mailOptions.to);
                    console.log('From:', mailOptions.from);
                    console.log('Subject:', mailOptions.subject);
                    console.log('--- HTML Content ---');
                    console.log(mailOptions.html || mailOptions.text);
                    console.log('===========================\n');
                    return { messageId: 'dev-mode-' + Date.now() };
                }
            };
        }
    }

    /**
     * Send email verification link
     */
    async sendVerificationEmail(email, token) {
        const verificationUrl = `${this.appUrl}/verify-email.html?token=${token}`;
        
        const mailOptions = {
            from: this.fromEmail,
            to: email,
            subject: 'Verify Your Email - Revit Cloud Model Publisher',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #0696D7 0%, #0057A0 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
                        .button { display: inline-block; background: #0696D7; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                        .footer { text-align: center; margin-top: 20px; color: #6c757d; font-size: 12px; }
                        .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Verify Your Email Address</h1>
                        </div>
                        <div class="content">
                            <p>Hello,</p>
                            <p>Thank you for registering with Revit Cloud Model Publisher!</p>
                            <p>Please click the button below to verify your email address and activate your account:</p>
                            
                            <div style="text-align: center;">
                                <a href="${verificationUrl}" class="button">Verify Email Address</a>
                            </div>
                            
                            <p>Or copy and paste this link into your browser:</p>
                            <p style="word-break: break-all; background: white; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px;">
                                ${verificationUrl}
                            </p>
                            
                            <div class="warning">
                                <strong>Note:</strong> This verification link does not expire, but can only be used once.
                            </div>
                            
                            <p>If you didn't create an account, please ignore this email.</p>
                        </div>
                        <div class="footer">
                            <p>© ${new Date().getFullYear()} Revit Cloud Model Publisher. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('Verification email sent:', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Failed to send verification email:', error);
            throw new Error('Failed to send verification email');
        }
    }

    /**
     * Send password reset email
     */
    async sendPasswordResetEmail(email, resetUrl) {
        const mailOptions = {
            from: this.fromEmail,
            to: email,
            subject: 'Password Reset - Revit Cloud Model Publisher',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #0696D7 0%, #0057A0 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
                        .button { display: inline-block; background: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                        .footer { text-align: center; margin-top: 20px; color: #6c757d; font-size: 12px; }
                        .warning { background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0; border-radius: 4px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Password Reset Request</h1>
                        </div>
                        <div class="content">
                            <p>Hello,</p>
                            <p>We received a request to reset your password for your Revit Cloud Model Publisher account.</p>
                            <p>Click the button below to reset your password:</p>
                            
                            <div style="text-align: center;">
                                <a href="${resetUrl}" class="button">Reset Password</a>
                            </div>
                            
                            <p>Or copy and paste this link into your browser:</p>
                            <p style="word-break: break-all; background: white; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px;">
                                ${resetUrl}
                            </p>
                            
                            <div class="warning">
                                <strong>Security Notice:</strong> If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
                            </div>
                        </div>
                        <div class="footer">
                            <p>© ${new Date().getFullYear()} Revit Cloud Model Publisher. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('Password reset email sent:', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Failed to send password reset email:', error);
            throw new Error('Failed to send password reset email');
        }
    }
}

module.exports = new EmailService();
