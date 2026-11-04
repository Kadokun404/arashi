import { sendCarousel } from "../src/helper/send-carousel.js"

export async function run({ sock, jid, m }) {
    await sendCarousel(sock, jid, {
        text: "🌄 *Anime Landscape HD Wallpaper*\nBerikut 4 gambar anime landscape resolusi tinggi pilihan dari Pinterest.\nSwipe kartu ke samping untuk menjelajah! ✨",
        footer: "Pinterest Anime HD Landscape • Arashi",
        quoted: m,
        cards: [
            {
                image: "https://i.pinimg.com/originals/a8/85/d5/a885d53478176663056b7959ee61b4ec.jpg",
                title: "🌅 Twilight Serenity",
                body: "Makoto Shinkai Sunset Horizon & Lake",
                footer: "Resolusi: 1920x1080 Full HD"
            },
            {
                image: "https://i.pinimg.com/originals/4b/69/7d/4b697d5e3d3c92fd4530c8d5987983f8.jpg",
                title: "🏔️ Fantasy Peaks",
                body: "Anime Mountain Peak & Vibrant Clouds",
                footer: "Resolusi: 1920x1080 Full HD"
            },
            {
                image: "https://i.pinimg.com/originals/ad/7e/43/ad7e434612dc0cfed485496ff23725cc.jpg",
                title: "🌌 Starry Night Horizon",
                body: "Anime Night Sky, Meteor & Milky Way",
                footer: "Resolusi: 3836x2362 4K Ultra HD"
            },
            {
                image: "https://i.pinimg.com/originals/68/e6/06/68e606d2a0ba951c2937e25f9c650324.jpg",
                title: "🌾 Peaceful Countryside",
                body: "Golden Hour Rural Japanese Scenery",
                footer: "Resolusi: 1456x816 HD Landscape"
            }
        ]
    })
}
