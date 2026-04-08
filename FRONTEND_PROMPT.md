# Frontend Developer Prompt — TimeMatter Auth Flow

Use this as your prompt to build or ask an AI to build the frontend authentication flow.

---

## Prompt

Build the authentication and profile-completion flow for a React Native (or React) app called **TimeMatter** that uses **Supabase** for OAuth sign-in and a custom Express backend for profile storage.

---

### Tech Stack
- **Supabase JS SDK** (`@supabase/supabase-js`) for OAuth
- **Backend base URL**: `http://localhost:3000` (change for production)
- **Backend API prefix**: `/api/auth`

---

### Environment variables needed (frontend)
```
SUPABASE_URL=https://zplltucaedxtryzdsepo.supabase.co
SUPABASE_ANON_KEY=sb_publishable_Zx0RnzPh2wKMOad0EIOaPA_JM1Thdhi
BACKEND_URL=http://localhost:3000
```

---

## Screen 1 — Sign In Screen

Show two buttons:
- **Continue with Google**
- **Continue with Facebook**

### What each button does:
```js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Google
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: 'YOUR_APP_REDIRECT_URL', // e.g. myapp://auth/callback
  },
});

// Facebook
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'facebook',
  options: {
    redirectTo: 'YOUR_APP_REDIRECT_URL',
  },
});
```

### After OAuth redirect callback — check profile status:
```js
// Get the session after redirect
const { data: { session } } = await supabase.auth.getSession();
const accessToken = session.access_token;

// Ask backend if profile is complete
const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const json = await res.json();

if (json.profile_complete === false) {
  // → Navigate to Screen 2 (Profile Completion)
} else {
  // → Navigate to the main app (Dashboard)
}
```

---

## Screen 2 — Profile Completion

This screen is shown **once**, after the first OAuth sign-in, to collect extra information.

### Layout

At the top show a **checkbox or toggle**: `"This is a company account"`

#### When checkbox is OFF (Individual account):

Show these fields:

| Field | Type | Required |
|-------|------|----------|
| Title | Dropdown: Mr / Mrs / Ms / Dr | No |
| Gender | Dropdown: Male / Female / Other | No |
| Date of Birth (dd/mm/yyyy) | Date picker | **Yes** |
| Age | Number input | **Yes** |
| Nationality | Text input | No |
| Religion | Text input | No |
| Address | Multi-line text | No |
| Profile Photo | Image picker (JPG/PNG) | No |
| Identity Card Front | Image picker (JPG/PNG) | **Yes** |
| Identity Card Back | Image picker (JPG/PNG) | **Yes** |

#### When checkbox is ON (Company account):

Show these fields:

| Field | Type | Required |
|-------|------|----------|
| Company Name | Text input | **Yes** |
| Company Address | Multi-line text | No |
| Company Document / Info | Image picker (JPG/PNG) | No |
| Profile Photo | Image picker (JPG/PNG) | No |

---

### Converting images to Base64 before sending

```js
// React Native example using expo-image-picker
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

const pickImage = async () => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.8,
  });

  if (!result.canceled) {
    const uri = result.assets[0].uri;
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const mimeType = uri.endsWith('.png') ? 'image/png' : 'image/jpeg';
    return `data:${mimeType};base64,${base64}`;
  }
};
```

---

### Submit handler — call the backend

```js
const handleSubmit = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session.access_token;

  // Build payload
  const payload = isCompany
    ? {
        isCompany: true,
        company_name: companyName,         // required
        company_address: companyAddress,
        companyInfo: companyInfoBase64,    // base64 string or null
        profilePhoto: profilePhotoBase64, // base64 string or null
      }
    : {
        isCompany: false,
        title: title,                       // "Mr" / "Mrs" etc.
        gender: gender,
        dateOfBirth: dateOfBirth,          // format: "25/06/1995"
        age: age,                          // number (required)
        nationality: nationality,
        religion: religion,
        address: address,
        profilePhoto: profilePhotoBase64, // base64 or null
        identityCardFront: idFrontBase64, // base64 (required)
        identityCardBack: idBackBase64,   // base64 (required)
      };

  const res = await fetch(`${BACKEND_URL}/api/auth/complete-profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();

  if (res.ok) {
    // → Navigate to main app (Dashboard)
  } else {
    // → Show error: json.error
  }
};
```

---

## API Reference (Backend)

### `GET /api/auth/me`
**Headers:** `Authorization: Bearer <supabase_access_token>`

**Response (profile not yet filled):**
```json
{ "profile_complete": false, "email": "user@example.com" }
```

**Response (profile exists):**
```json
{
  "profile_complete": true,
  "role": "USER",
  "user": {
    "id": "...",
    "email": "...",
    "account_type": "individual",
    "role": "USER",
    "is_blocked": false,
    "title": "Mr",
    "gender": "Male",
    "dob": "1995-06-25",
    "age": 29,
    "nationality": "Malaysian",
    "religion": "Islam",
    "address": "...",
    "profile_photo_url": "https://...",
    "id_card_front_url": "https://...",
    "id_card_back_url": "https://..."
  }
}
```

**Response (blocked user — HTTP 403):**
```json
{ "error": "Your account has been blocked. Please contact support.", "is_blocked": true }
```

---

### `POST /api/auth/complete-profile`
**Headers:** `Authorization: Bearer <supabase_access_token>`, `Content-Type: application/json`

**Success response:**
```json
{ "message": "Profile saved successfully", "user": { ... } }
```

**Error response:**
```json
{ "error": "company_name is required for company accounts" }
```

---

---

## Screen 3 — Admin: All Users Page

Only visible when `role === 'ADMIN'` (check the value returned by `GET /api/auth/me`).

### What to show:
A table/list of all users with these columns:
- Profile photo (small avatar)
- Email
- Account type (Individual / Company)
- Name (title + gender for individual, company_name for company)
- Status badge: **Active** (green) or **Blocked** (red) — based on `is_blocked`
- Action button: **Block** (if active) or **Unblock** (if already blocked)
- Admins show a **ADMIN** badge and no Block button

### Fetch all users:
```js
const res = await fetch(`${BACKEND_URL}/api/admin/users`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const { users } = await res.json();
```

### Block a user:
```js
await fetch(`${BACKEND_URL}/api/admin/users/${userId}/block`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${accessToken}` },
});
// Then refresh the user list
```

### Unblock a user:
```js
await fetch(`${BACKEND_URL}/api/admin/users/${userId}/unblock`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${accessToken}` },
});
// Then refresh the user list
```

---

## Navigation / Route Guard Logic

```
App start
  └─ Check supabase.auth.getSession()
       ├─ No session → Screen 1 (Sign In)
       └─ Has session → GET /api/auth/me
              ├─ HTTP 403 + is_blocked: true → Show "Account Blocked" screen
              ├─ profile_complete: false     → Screen 2 (Complete Profile)
              └─ profile_complete: true
                     ├─ role === 'ADMIN' → show "All Users" tab in navigation
                     └─ role === 'USER'  → Dashboard (no admin tab)
```

---

## Supabase OAuth Setup (one-time, done in Supabase dashboard)

1. Go to **Supabase Dashboard → Authentication → Providers**
2. Enable **Google** and **Facebook**
3. For each provider you need to create an OAuth App and paste the Client ID + Secret into Supabase:

   **Google (free, easiest):**
   - Go to [console.cloud.google.com](https://console.cloud.google.com)
   - APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
   - Application type: Web application
   - Copy the **Client ID** and **Client Secret** into Supabase

   **Facebook (requires Facebook Developer account):**
   - Go to [developers.facebook.com](https://developers.facebook.com) → My Apps → Create App
   - Add **Facebook Login** product
   - Copy the **App ID** and **App Secret** into Supabase

4. In each OAuth app's settings, add the **redirect URL** shown on the Supabase provider settings page to the list of allowed redirect URIs
