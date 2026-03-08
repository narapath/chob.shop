# 🚀 Chob.Shop Deployment Guide (DirectAdmin)

Follow these steps to get your site live on DirectAdmin:

### 1. File Preparation
- Zip all files in the project folder.
- **IMPORTANT**: Exclude `node_modules` and `.git` folders to keep the zip file small.
- Ensure your `.env` file is included in the zip.

### 2. Configure DirectAdmin Node.js App
1. Login to **DirectAdmin**.
2. Go to **"Setup Node.js App"**.
3. Click **"Create Application"**.
4. Set the following:
   - **Node.js version**: 18.x or 20.x
   - **Application mode**: Production
   - **Application root**: `public_html/chob-shop` (or your folder name)
   - **Application URL**: `yourdomain.com`
   - **Application startup file**: `server.js`
5. Click **"Create"**.

### 3. Upload & Install
1. Use **File Manager** to upload your `.zip` file to the **Application root** folder you created.
2. Extract the `.zip` file inside that folder.
3. Go back to the **Setup Node.js App** page.
4. Click **"Run NPM Install"**.
5. Once finished, click **"Restart Application"**.

### 4. Final Environment Settings
- Edit the `.env` file on the server (via File Manager):
  - Set `SITE_URL=https://yourdomain.com`
  - (Optional but Recommended) Change `ADMIN_PASS` for security.
  - Restart the app again after changing `.env`.

---
✅ **Done!** Your site should now be accessible at your domain.
