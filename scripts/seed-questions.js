const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const client = new MongoClient(uri);

const questions = [
  // Science
  { category: 'science', q: 'Which planet is known as the Red Planet?', opts: ['Venus', 'Mars', 'Jupiter', 'Mercury'], a: 1 },
  { category: 'science', q: 'What is the chemical symbol for water?', opts: ['H2O', 'CO2', 'NaCl', 'O2'], a: 0 },
  { category: 'science', q: 'How many bones are in the human body?', opts: ['206', '208', '210', '204'], a: 0 },
  { category: 'science', q: 'What gas makes up most of Earth\'s atmosphere?', opts: ['Oxygen', 'Carbon Dioxide', 'Nitrogen', 'Hydrogen'], a: 2 },
  { category: 'science', q: 'Which organ produces insulin?', opts: ['Liver', 'Kidney', 'Pancreas', 'Heart'], a: 2 },
  
  // History
  { category: 'history', q: 'The Roman Empire (West) fell in?', opts: ['476', '632', '1066', '1492'], a: 0 },
  { category: 'history', q: 'Who was the first President of the United States?', opts: ['Thomas Jefferson', 'George Washington', 'John Adams', 'Benjamin Franklin'], a: 1 },
  { category: 'history', q: 'In which year did World War II end?', opts: ['1944', '1945', '1946', '1947'], a: 1 },
  { category: 'history', q: 'Which empire was ruled by Julius Caesar?', opts: ['Greek', 'Roman', 'Persian', 'Egyptian'], a: 1 },
  { category: 'history', q: 'The Great Wall of China was built to keep out which people?', opts: ['Mongols', 'Japanese', 'Russians', 'Indians'], a: 0 },
  
  // Art
  { category: 'art', q: 'Mona Lisa was painted by…', opts: ['Michelangelo', 'Raphael', 'Da Vinci', 'Van Gogh'], a: 2 },
  { category: 'art', q: 'Which artist cut off his own ear?', opts: ['Picasso', 'Van Gogh', 'Monet', 'Renoir'], a: 1 },
  { category: 'art', q: 'The Starry Night was painted by?', opts: ['Van Gogh', 'Picasso', 'Monet', 'Da Vinci'], a: 0 },
  { category: 'art', q: 'Which art movement was Picasso associated with?', opts: ['Impressionism', 'Cubism', 'Surrealism', 'Pop Art'], a: 1 },
  { category: 'art', q: 'The statue of David was created by?', opts: ['Da Vinci', 'Michelangelo', 'Raphael', 'Donatello'], a: 1 },
  
  // Sports
  { category: 'sports', q: 'Soccer team players on field?', opts: ['9', '10', '11', '12'], a: 2 },
  { category: 'sports', q: 'How many players are on a basketball team?', opts: ['5', '6', '7', '8'], a: 0 },
  { category: 'sports', q: 'In which sport do you use a shuttlecock?', opts: ['Tennis', 'Badminton', 'Squash', 'Table Tennis'], a: 1 },
  { category: 'sports', q: 'How many holes are there in a standard golf course?', opts: ['16', '18', '20', '22'], a: 1 },
  { category: 'sports', q: 'Which country won the first FIFA World Cup?', opts: ['Brazil', 'Argentina', 'Uruguay', 'Italy'], a: 2 },
  
  // Geography
  { category: 'geography', q: 'Capital of Japan?', opts: ['Kyoto', 'Tokyo', 'Osaka', 'Nagoya'], a: 1 },
  { category: 'geography', q: 'Which is the longest river in the world?', opts: ['Amazon', 'Nile', 'Yangtze', 'Mississippi'], a: 1 },
  { category: 'geography', q: 'Mount Everest is located in?', opts: ['Nepal', 'India', 'Tibet', 'China'], a: 0 },
  { category: 'geography', q: 'Which is the largest continent?', opts: ['Africa', 'Asia', 'North America', 'Europe'], a: 1 },
  { category: 'geography', q: 'The Sahara Desert is located in which continent?', opts: ['Asia', 'Australia', 'Africa', 'South America'], a: 2 },
  
  // Entertainment
  { category: 'entertainment', q: '"May the Force be with you" film?', opts: ['Star Trek', 'Star Wars', 'Matrix', 'Avatar'], a: 1 },
  { category: 'entertainment', q: 'Who directed the movie "Jaws"?', opts: ['George Lucas', 'Steven Spielberg', 'Martin Scorsese', 'Francis Ford Coppola'], a: 1 },
  { category: 'entertainment', q: 'Which movie won the first Academy Award for Best Picture?', opts: ['Wings', 'Sunrise', 'The Jazz Singer', 'All Quiet on the Western Front'], a: 0 },
  { category: 'entertainment', q: 'Which streaming platform produced "Stranger Things"?', opts: ['Netflix', 'Amazon Prime', 'Disney+', 'Hulu'], a: 0 },
  { category: 'entertainment', q: 'Who played Jack in "Titanic"?', opts: ['Brad Pitt', 'Leonardo DiCaprio', 'Matt Damon', 'Tom Cruise'], a: 1 },
];

async function seedQuestions() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('trivio');
    const collection = db.collection('questions');

    // Clear existing questions
    await collection.deleteMany({});
    console.log('Cleared existing questions');

    // Insert new questions
    const result = await collection.insertMany(questions);
    console.log(`Inserted ${result.insertedCount} questions`);

    // Create index on category for faster queries
    await collection.createIndex({ category: 1 });
    console.log('Created index on category field');

  } catch (error) {
    console.error('Error seeding questions:', error);
  } finally {
    await client.close();
  }
}

seedQuestions();
