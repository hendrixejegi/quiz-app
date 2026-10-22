const question = (id, prompt, answer, ...options) => ({ id, prompt, answer, options });

export const DEMO_CATEGORIES = [
  {
    id: 'everyday',
    name: 'Everyday Knowledge',
    detail: 'Familiar facts from everyday life',
    icon: '01',
    questions: [
      question('everyday-1', 'How many seconds are in one minute?', '60', '30', '60', '90', '100'),
      question('everyday-2', 'At what temperature does fresh water freeze at standard atmospheric pressure?', '0°C', '0°C', '10°C', '32°C', '100°C'),
      question('everyday-3', 'Which organ pumps blood around the human body?', 'The heart', 'The lungs', 'The liver', 'The heart', 'The kidneys'),
      question('everyday-4', 'How many days are in a standard week?', '7', '5', '6', '7', '8'),
      question('everyday-5', 'What is the largest mammal on Earth?', 'The blue whale', 'The African elephant', 'The blue whale', 'The giraffe', 'The great white shark'),
      question('everyday-6', 'Which instrument is used to measure temperature?', 'A thermometer', 'A barometer', 'A thermometer', 'A compass', 'A speedometer'),
      question('everyday-7', 'Which three colors are the primary colors of light?', 'Red, green, and blue', 'Red, yellow, and blue', 'Orange, green, and purple', 'Red, green, and blue', 'Black, white, and gray'),
      question('everyday-8', 'What is the name of Japan’s currency?', 'The yen', 'The won', 'The yuan', 'The yen', 'The baht'),
      question('everyday-9', 'How many sides does a hexagon have?', '6', '5', '6', '7', '8'),
      question('everyday-10', 'Which sense is primarily associated with the ears?', 'Hearing', 'Balance', 'Touch', 'Hearing', 'Smell'),
    ],
  },
  {
    id: 'geography',
    name: 'World Geography',
    detail: 'Countries, landmarks, and the natural world',
    icon: '02',
    questions: [
      question('geography-1', 'What is the capital city of Japan?', 'Tokyo', 'Kyoto', 'Osaka', 'Tokyo', 'Hiroshima'),
      question('geography-2', 'On which continent is Egypt located?', 'Africa', 'Asia', 'Africa', 'Europe', 'South America'),
      question('geography-3', 'On which continent is the Amazon rainforest primarily located?', 'South America', 'Africa', 'Asia', 'South America', 'Europe'),
      question('geography-4', 'Which desert covers much of northern Africa?', 'The Sahara', 'The Gobi', 'The Kalahari', 'The Sahara', 'The Atacama'),
      question('geography-5', 'What is the capital city of Canada?', 'Ottawa', 'Toronto', 'Vancouver', 'Ottawa', 'Montreal'),
      question('geography-6', 'Which mountain range forms much of the border between France and Spain?', 'The Pyrenees', 'The Alps', 'The Carpathians', 'The Pyrenees', 'The Apennines'),
      question('geography-7', 'Which country is often described as being shaped like a boot?', 'Italy', 'Greece', 'Portugal', 'Italy', 'Croatia'),
      question('geography-8', 'In which country is the Taj Mahal located?', 'India', 'Pakistan', 'India', 'Nepal', 'Bangladesh'),
      question('geography-9', 'Which ocean borders the east coast of the United States?', 'The Atlantic Ocean', 'The Pacific Ocean', 'The Indian Ocean', 'The Atlantic Ocean', 'The Arctic Ocean'),
      question('geography-10', 'What is the capital city of Nigeria?', 'Abuja', 'Lagos', 'Kano', 'Port Harcourt', 'Abuja'),
    ],
  },
  {
    id: 'python',
    name: 'Python Basics',
    detail: 'A quick introduction to Python programming',
    icon: '03',
    timeLimitSeconds: 10,
    questions: [
      question('python-1', 'Which keyword is used to define a function in Python?', 'def', 'func', 'function', 'def', 'lambda'),
      question('python-2', 'What does len(["a", "b", "c"]) return?', '3', '2', '3', '4', '0'),
      question('python-3', 'Which of these Python types is immutable?', 'tuple', 'list', 'dict', 'set', 'tuple'),
      question('python-4', 'What value is printed by print(2 ** 3)?', '8', '6', '8', '9', '23'),
      question('python-5', 'Which operator checks whether two values are equal?', '==', '=', '==', '!=', '>='),
    ],
  },
];

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createDemoQuizPayload(categoryId, random = Math.random) {
  const category = DEMO_CATEGORIES.find(({ id }) => id === categoryId);
  if (!category) throw new Error('Choose a demo quiz category.');

  return {
    title: `${category.name} — Demo Quiz`,
    questions: shuffle(category.questions, random).map(({ prompt, answer, options }) => {
      const choices = shuffle(options, random);
      return {
        prompt,
        choices,
        correct_choice_index: choices.indexOf(answer),
        time_limit_seconds: category.timeLimitSeconds ?? 20,
      };
    }),
  };
}
