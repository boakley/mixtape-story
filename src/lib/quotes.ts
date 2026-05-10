// Music quotes for the landing page.
// Source: https://wellbeing.gmu.edu/famous-quotes-on-music-and-well-being/
// Pulled 2026-05-09. A few obvious typos in the source were corrected:
//   - "Jimmy Hendrix" → "Jimi Hendrix"
//   - "safe king of high" → "safe kind of high"
//   - "Arthur Shopenhauer" → "Arthur Schopenhauer"

export type Quote = {
  quote: string;
  author: string;
};

export const quotes: Quote[] = [
  { quote: 'Music is forever; music should grow and mature with you, following you right on up until you die.', author: 'Paul Simon' },
  { quote: 'Do you know that your soul is composed of harmony?', author: 'Leonardo da Vinci' },
  { quote: "Music is to me like breathing. I don't get tired of breathing, so I don't get tired of music!", author: 'Ray Charles' },
  { quote: 'Music is the mediator between the spiritual and the sensual life.', author: 'Ludwig van Beethoven' },
  { quote: 'If you want to know the secrets of the universe, think in terms of energy, frequency and vibration.', author: 'Nikola Tesla' },
  { quote: 'Music produces a kind of pleasure which human nature cannot do without.', author: 'Confucius' },
  { quote: 'Music is the art of the prophets and the gifts of God.', author: 'Martin Luther' },
  { quote: 'Words make you think a thought. Music makes you feel a feeling. A song makes you feel a thought.', author: 'E.Y. Harburg' },
  { quote: 'After silence, that which comes nearest to expressing the inexpressible is music.', author: 'Aldous Huxley' },
  { quote: 'Musical training is a more potent instrument than any other in the integration of the human being because rhythm and harmony find their way into the inward places of the soul on which they mightily fasten, imparting grace, and making the soul of him who is rightly educated truly graceful.', author: 'Plato' },
  { quote: 'One good thing about music is that when it hits you, you feel no pain.', author: 'Bob Marley' },
  { quote: 'Music, the greatest good that mortals know, and all of heaven we have below.', author: 'Joseph Addison' },
  { quote: 'Music offers a record of history and human experience that words and images cannot. … music has a unique ability to convey memory.', author: 'Marion Jacobson' },
  { quote: 'There is nothing in the world so much like prayer as music is.', author: 'William P. Merrill' },
  { quote: 'Life is a symphony, and the action of every person in this life is the playing of his particular part in the music.', author: 'Hazrat Inayat Khan' },
  { quote: 'Music is the wine that fills the cup of silence.', author: 'Robert Fripp' },
  { quote: 'Music is a safe kind of high.', author: 'Jimi Hendrix' },
  { quote: "Music has a great power for bringing people together. With so many forces in this world acting to drive wedges between people, it's important to preserve those things that help us experience our common humanity.", author: 'Ted Turner' },
  { quote: 'Alas for those who never sing, but die with all their music in them!', author: 'Oliver Wendell Holmes' },
  { quote: 'Music is that voice that tells us that the human race is greater than it knows.', author: 'Napoleon Bonaparte' },
  { quote: 'Take a music bath once or twice a week for a few seasons, and you will find that it is to the soul what the water bath is to the body.', author: 'Oliver Wendell Holmes' },
  { quote: "At that elusive moment when we transcend our ordinary performance and feel in harmony with something else – whether it's a glorious sunset, inspiring music or another human being – our studies have shown that what we are really coming in sync with is ourselves.", author: 'Doc Childre and Howard Martin' },
  { quote: 'Rhythm is the soul of life. The whole universe revolves in rhythm. Everything and every human action revolves in rhythm.', author: 'Baba Tunji' },
  { quote: 'The power of music to integrate and cure … is quite fundamental. It is the profoundest non-chemical medication.', author: 'Oliver Sacks' },
  { quote: "I think music in itself is healing. It's an explosive expression of humanity. It's something we are all touched by. No matter what culture we're from, everyone loves music.", author: 'Billy Joel' },
  { quote: 'Music washes away from the soul the dust of everyday life.', author: 'Berthold Auerbach' },
  { quote: 'The earth has music for those who listen.', author: 'William Shakespeare' },
  { quote: 'Music acts like a magic key, to which the most tightly closed heart opens.', author: 'Maria Augusta von Trapp' },
  { quote: 'If you are able to discover your own keynote or chord and play it over gently to yourself, you will revive as if by magic.', author: 'Vera Stanley Alder' },
  { quote: 'Our brains are wired from the beginning to process and understand music.', author: 'Kimberly Moore' },
  { quote: 'Music is the universal language of mankind.', author: 'Henry Wadsworth Longfellow' },
  { quote: 'The knower of the mystery of sound knows the mystery of the whole universe.', author: 'Hazrat Inayat Khan' },
  { quote: 'At the root of all power and motion, there is music and rhythm, the play of patterned frequencies against the matrix of time.', author: 'Joachim-Ernst Berendt' },
  { quote: 'Music is the vernacular of the human soul.', author: 'Geoffrey Latham' },
  { quote: 'To enter into the initiation of sound, of vibration and mindfulness, is to take a giant step toward consciously knowing the soul.', author: 'Don G. Campbell' },
  { quote: 'Music raises in the mind of the hearer great conceptions: it strengthens and advances praise into rapture.', author: 'Joseph Addison' },
  { quote: 'Healing relies on an openness to the whole; a willingness to relinquish whatever frustrates or delays — mistaken ideas, negative feelings, poor diet, inadvisable lifestyle — and to accept a wider spectrum of responses with new ideas, experience, and priorities.', author: 'Olivea Dewhurst-Maddock' },
  { quote: "You can look at disease as a form of disharmony. And there's no organ system in the body that's not affected by sound and music and vibration.", author: 'Mitchell Gaynor, M.D.' },
  { quote: 'Music … will help dissolve your perplexities and purify your character and sensibilities, and in time of care and sorrow, will keep a fountain of joy alive in you.', author: 'Dietrich Bonhoeffer' },
  { quote: 'Music expresses that which cannot be said and on which it is impossible to be silent.', author: 'Victor Hugo' },
  { quote: 'There is a song reaching the whole earth, written from patience, love and prayer. Neither violent nor assertive, it is peace begetting peace, love made manifest.', author: 'Katharine Le Mée' },
  { quote: 'Music is the melody whose text is the world.', author: 'Arthur Schopenhauer' },
  { quote: 'Love is like a violin. The music may stop now and then, but the strings remain forever.', author: 'June Masters Bacher' },
  { quote: 'Music is the medicine of the breaking heart.', author: 'Leigh Hunt' },
  { quote: 'Just as certain selections of music will nourish the physical body and your emotional layer, so other musical works will bring greater health to your mind.', author: 'Hal A. Lingerman' },
  { quote: 'Music is a therapy. It is a communication far more powerful than words, far more immediate, far more efficient.', author: 'Yehudi Menuhin' },
  { quote: 'Music has touched the human soul across all boundaries of time, space, and genre. … Perhaps, in its vibratory nature, music opens us to a greater appreciation of our essential connectedness to the cosmos, our oneness with all that is.', author: 'Balfour M. Mount' }
];
