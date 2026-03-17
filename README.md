## 📖 About

**Servd** is a smart, AI-powered recipe platform that helps you cook better meals using ingredients you already have. Snap a photo of your fridge, and our AI chef will suggest personalized recipes — reducing food waste and saving you money.

<img width="1592" height="787" alt="image" src="https://github.com/user-attachments/assets/67ee3be5-64f2-4b7e-8ed5-ac7240817ef7" />
<img width="1592" height="787" alt="image" src="https://github.com/user-attachments/assets/67ee3be5-64f2-4b7e-8ed5-ac7240817ef7" />


---

## ✨ Features

| Feature | Description |
|---|---|
| 📸 **Pantry Scanner** | AI-powered photo recognition to identify ingredients from your fridge |
| 🤖 **AI Chef Suggestions** | Google Gemini AI generates personalized recipes from available ingredients |
| 🔍 **Recipe Search** | Search any dish, filter by cuisine, time, or dietary needs |
| 📚 **Digital Cookbook** | Save favorites, export as PDF, and share with family |
| 🔐 **Secure Auth** | User authentication powered by Clerk |
| 🛡️ **Rate Limiting** | Arcjet-powered API protection and abuse prevention |
| 🖼️ **Beautiful Images** | Dynamic food imagery via Unsplash API |

---

## 🛠️ Tech Stack

### Frontend
- **[Next.js 15](https://nextjs.org/)** — React framework with App Router
- **[Tailwind CSS](https://tailwindcss.com/)** — Utility-first styling
- **[Clerk](https://clerk.com/)** — Authentication & user management

### Backend
- **[Strapi CMS](https://strapi.io/)** — Headless CMS for recipe data management
- **[Google Gemini AI](https://deepmind.google/technologies/gemini/)** — AI-powered recipe generation
- **[Arcjet](https://arcjet.com/)** — Security, rate limiting, and bot protection

### Integrations
- **[Unsplash API](https://unsplash.com/developers)** — High-quality food photography

### Deployment
- **[Vercel](https://vercel.com/)** — Frontend hosting & CI/CD

---

## 🚀 Getting Started

### Prerequisites

- Node.js `v18+`
- npm or yarn
- A Strapi backend instance running
- API keys for: Clerk, Google Gemini, Arcjet, Unsplash

### 1. Clone the Repository

```bash
git clone https://github.com/Chimmi-1/Recipe_Servd.git
cd Recipe_Servd
```

### 2. Setup Frontend

```bash
cd frontend
npm install
```

Create a `.env.local` file in the `frontend` directory:

```env
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key

NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# Strapi Backend
NEXT_PUBLIC_STRAPI_URL=http://localhost:1337

# Google Gemini AI
GEMINI_API_KEY=your_gemini_api_key

# Unsplash
UNSPLASH_ACCESS_KEY=your_unsplash_access_key

# Arcjet
ARCJET_KEY=your_arcjet_key
```

```bash
npm run dev
```

### 3. Setup Backend (Strapi)

```bash
cd backend
npm install
npm run develop
```

The Strapi admin panel will be available at `http://localhost:1337/admin`.

---

## 📁 Project Structure

```
Recipe_Servd/
├── frontend/                  # Next.js application
│   ├── app/                   # App Router pages & layouts
│   │   ├── (auth)/            # Auth routes (sign-in, sign-up)
│   │   ├── dashboard/         # Main user dashboard
│   │   ├── recipes/           # Recipe browsing & detail pages
│   │   ├── pantry/            # Pantry management
│   │   └── layout.tsx         # Root layout with Clerk provider
│   ├── components/            # Reusable UI components
│   ├── lib/                   # Utility functions & API helpers
│   └── public/                # Static assets
│
└── backend/                   # Strapi CMS
    ├── src/
    │   ├── api/               # Content types (recipes, ingredients)
    │   └── middlewares/       # Custom middlewares
    └── config/                # Strapi configuration
```

---

## 🔄 How It Works

```
User uploads fridge photo
        ↓
Gemini AI identifies ingredients
        ↓
AI generates personalized recipe suggestions
        ↓
Recipes fetched/stored via Strapi CMS
        ↓
Unsplash API provides dish imagery
        ↓
User saves favorite recipes to Digital Cookbook
```

---

## 📸 Screenshots

| Landing Page | Dashboard | Recipe Detail |
|---|---|---|
| *AI-powered hero section* | *Pantry scanner & suggestions* | *Step-by-step cooking mode* |

> Visit the live app: [recipe-servd.vercel.app](https://recipe-servd.vercel.app/)

---

## 🌐 Deployment

The frontend is deployed on **Vercel**. To deploy your own instance:

1. Fork this repository
2. Connect to Vercel via [vercel.com](https://vercel.com)
3. Set all environment variables in the Vercel dashboard
4. Deploy!

For the Strapi backend, you can deploy on **Railway**, **Render**, or **DigitalOcean**.

---

## 📈 Roadmap

- [ ] Mobile app (React Native)
- [ ] Weekly meal planning
- [ ] Grocery list generation
- [ ] Nutritional info per recipe
- [ ] Social sharing & community recipes
- [ ] Voice-guided cooking mode

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author

**Simhachalam**

[![GitHub](https://img.shields.io/badge/GitHub-Chimmi--1-181717?style=flat-square&logo=github)](https://github.com/Chimmi-1)
