// Fictional leader name pools. Leaders in WORLDSTATE are invented people.
type Pool = { f: string[]; l: string[]; order?: 'lf' };
export const POOLS: Record<string, Pool> = {
  anglo: { f: ['James', 'Michael', 'Sarah', 'Emily', 'Robert', 'David', 'Laura', 'Thomas', 'Helen', 'Daniel', 'Grace', 'William', 'Olivia', 'Richard', 'Catherine', 'Marcus', 'Eleanor', 'Nathan'], l: ['Harrington', 'Whitfield', 'Calloway', 'Ashford', 'Brennan', 'Mercer', 'Langley', 'Holloway', 'Prescott', 'Sinclair', 'Thornton', 'Kendrick', 'Delaney', 'Winslow', 'Avery', 'Fairbanks', 'Garrison', 'Hale'] },
  hispanic: { f: ['Alejandro', 'Camila', 'Javier', 'Lucía', 'Mateo', 'Valentina', 'Ricardo', 'Isabel', 'Andrés', 'Carolina', 'Diego', 'Mariana', 'Fernando', 'Gabriela', 'Rodrigo', 'Paula'], l: ['Herrera', 'Castillo', 'Mendoza', 'Ortega', 'Navarro', 'Vargas', 'Rojas', 'Salazar', 'Fuentes', 'Morales', 'Delgado', 'Cabrera', 'Paredes', 'Ibarra', 'Quiroga', 'Montoya'] },
  filipino: { f: ['Jose', 'Maria', 'Ramon', 'Teresa', 'Antonio', 'Corazon', 'Emilio', 'Lourdes'], l: ['Reyes', 'Santos', 'Cruz', 'Bautista', 'Villanueva', 'Aquino', 'Mendoza', 'Dizon'] },
  luso: { f: ['João', 'Ana', 'Pedro', 'Beatriz', 'Rafael', 'Luísa', 'Tiago', 'Mariana', 'Gonçalo', 'Inês', 'Rui', 'Helena'], l: ['Almeida', 'Carvalho', 'Ferreira', 'Barbosa', 'Teixeira', 'Moreira', 'Cardoso', 'Pereira', 'Correia', 'Sampaio', 'Nogueira'] },
  french: { f: ['Étienne', 'Claire', 'Julien', 'Camille', 'Laurent', 'Mathilde', 'Olivier', 'Hélène', 'Antoine', 'Sophie', 'Rémi', 'Juliette'], l: ['Moreau', 'Lefèvre', 'Girard', 'Bonnet', 'Dufresne', 'Marchand', 'Rousseau', 'Fontaine', 'Chevalier', 'Garnier', 'Lacroix', 'Perrin'] },
  german: { f: ['Matthias', 'Katrin', 'Stefan', 'Julia', 'Tobias', 'Annika', 'Lukas', 'Friederike', 'Jonas', 'Sabine', 'Henrik', 'Margit'], l: ['Hartmann', 'Becker', 'Vogel', 'Lindner', 'Brandt', 'Kessler', 'Richter', 'Wagner', 'Albrecht', 'Engel', 'Vermeulen', 'de Groot'] },
  nordic: { f: ['Erik', 'Ingrid', 'Lars', 'Astrid', 'Mikael', 'Sofia', 'Henrik', 'Kaisa', 'Anders', 'Linnea', 'Jari', 'Signe'], l: ['Lindqvist', 'Halvorsen', 'Nyström', 'Virtanen', 'Bergström', 'Dahl', 'Korhonen', 'Sandberg', 'Holm', 'Lehtonen', 'Tamm', 'Rask'] },
  italian: { f: ['Marco', 'Giulia', 'Luca', 'Francesca', 'Alessandro', 'Chiara', 'Giovanni', 'Elena', 'Andrei', 'Ioana'], l: ['Bianchi', 'Ferraro', 'Romano', 'Galli', 'Conti', 'Marino', 'Greco', 'Lombardi', 'Popescu', 'Ionescu'] },
  eslav: { f: ['Dmitri', 'Alexei', 'Natalia', 'Sergei', 'Irina', 'Viktor', 'Olga', 'Andrei', 'Yelena', 'Mikhail', 'Pavel', 'Svetlana', 'Oleksandr', 'Taras'], l: ['Volkov', 'Sokolov', 'Morozov', 'Lebedev', 'Kuznetsov', 'Orlov', 'Zaitsev', 'Belov', 'Kovalenko', 'Shevchuk', 'Bondarenko', 'Melnyk', 'Gromov', 'Tkachenko'] },
  wslav: { f: ['Tomasz', 'Agnieszka', 'Piotr', 'Katarzyna', 'Marek', 'Jana', 'Nikola', 'Milica', 'Dragan', 'Ivana', 'Gábor', 'Zsófia', 'Rasa', 'Mindaugas'], l: ['Nowak', 'Kowalski', 'Wiśniewski', 'Novák', 'Horvat', 'Petrović', 'Jovanović', 'Kovač', 'Dvořák', 'Marković', 'Szabó', 'Kazlauskas', 'Ozols', 'Dimitrov'] },
  greek: { f: ['Nikos', 'Eleni', 'Giorgos', 'Maria', 'Kostas', 'Sofia', 'Andreas', 'Katerina'], l: ['Papadopoulos', 'Georgiou', 'Konstantinou', 'Nikolaidis', 'Christodoulou', 'Antoniou', 'Vlachos', 'Stavrou'] },
  balkan: { f: ['Arben', 'Blerta', 'Ilir', 'Elira', 'Driton', 'Vjosa', 'Gent', 'Mimoza'], l: ['Hoxha', 'Krasniqi', 'Berisha', 'Gashi', 'Shala', 'Morina', 'Dervishi', 'Kelmendi'] },
  turkic: { f: ['Mehmet', 'Ayşe', 'Emre', 'Zeynep', 'Murat', 'Elif', 'Nurlan', 'Aigerim', 'Rustam', 'Dilnoza', 'Arman', 'Kamila', 'Ilham', 'Leyla'], l: ['Yıldırım', 'Demir', 'Kaya', 'Aydın', 'Sultanov', 'Yusupov', 'Bekov', 'Ermekov', 'Kurbanov', 'Mammadov', 'Aliyev', 'Saparov', 'Öztürk', 'Çelik'] },
  caucasus: { f: ['Levan', 'Nino', 'Giorgi', 'Tamar', 'Armen', 'Ani', 'Davit', 'Lusine'], l: ['Beridze', 'Kapanadze', 'Lomidze', 'Gelashvili', 'Harutyunyan', 'Petrosyan', 'Grigoryan', 'Sargsyan'] },
  mongol: { f: ['Bat-Erdene', 'Oyunchimeg', 'Ganbold', 'Sarnai'], l: ['Batbayar', 'Dorj', 'Ganzorig', 'Tsogt'] },
  persian: { f: ['Reza', 'Dariush', 'Mehdi', 'Shirin', 'Kaveh', 'Parisa', 'Hossein', 'Laleh', 'Ahmad', 'Farid'], l: ['Tehrani', 'Moradi', 'Rahimi', 'Karimi', 'Hosseini', 'Jafari', 'Sadeghi', 'Farahani', 'Haqqani', 'Rahmani'] },
  hebrew: { f: ['Avi', 'Noa', 'Yossi', 'Tamar', 'Eitan', 'Michal', 'Ronen', 'Shira'], l: ['Ben-David', 'Levi', 'Mizrahi', 'Peretz', 'Shapiro', 'Katz', 'Golan', 'Avraham'] },
  arab: { f: ['Khalid', 'Omar', 'Yusuf', 'Layla', 'Faisal', 'Amira', 'Tariq', 'Nadia', 'Hassan', 'Rania', 'Karim', 'Samira', 'Ibrahim', 'Mansour', 'Salim', 'Hind'], l: ['Al-Rashid', 'Haddad', 'Mansour', 'Al-Hashimi', 'Khalil', 'Nasser', 'Saleh', 'Darwish', 'Al-Masri', 'Qasim', 'Fayed', 'Al-Tamimi', 'Benali', 'Boumediene', 'Al-Zahrani', 'Abdelkader'] },
  sasian: { f: ['Arjun', 'Priya', 'Rahul', 'Ananya', 'Vikram', 'Kavita', 'Sanjay', 'Meera', 'Rajiv', 'Nisha', 'Dinesh', 'Lakshmi'], l: ['Sharma', 'Patel', 'Reddy', 'Iyer', 'Rao', 'Mehta', 'Banerjee', 'Perera', 'Thapa', 'Nair', 'Joshi', 'Gupta'] },
  sasian_m: { f: ['Imran', 'Ayesha', 'Farhan', 'Sana', 'Tariq', 'Nusrat', 'Asif', 'Rukhsana', 'Bilal', 'Shirin'], l: ['Chaudhry', 'Malik', 'Qureshi', 'Siddiqui', 'Rahman', 'Hossain', 'Mirza', 'Sheikh', 'Awan', 'Talukder'] },
  chinese: { f: ['Wei', 'Jian', 'Li', 'Ming', 'Hua', 'Yan', 'Jun', 'Lei', 'Xin', 'Hao', 'Qiang', 'Lan'], l: ['Zhao', 'Chen', 'Liu', 'Huang', 'Zhou', 'Wu', 'Xu', 'Sun', 'Ma', 'Gao', 'Lin', 'Guo'], order: 'lf' },
  japanese: { f: ['Hiroshi', 'Yuki', 'Takeshi', 'Aiko', 'Kenji', 'Haruka', 'Daisuke', 'Emi', 'Shinji', 'Naoko'], l: ['Tanaka', 'Watanabe', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato', 'Sasaki', 'Matsumoto', 'Inoue', 'Mori'], order: 'lf' },
  korean: { f: ['Min-jun', 'Ji-woo', 'Seo-yeon', 'Dong-hyun', 'Hye-jin', 'Sung-ho', 'Young-soo', 'Eun-ji'], l: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Yoon', 'Han'], order: 'lf' },
  viet: { f: ['Van An', 'Thi Lan', 'Minh Duc', 'Thi Hoa', 'Quoc Bao', 'Thanh Tam'], l: ['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Vu'], order: 'lf' },
  thai: { f: ['Somchai', 'Arthit', 'Niran', 'Pranee', 'Sokha', 'Vanna', 'Thura', 'Aye'], l: ['Srisuk', 'Wongsa', 'Charoen', 'Boonmee', 'Chhim', 'Sophal', 'Win', 'Kyaw'] },
  malay: { f: ['Budi', 'Siti', 'Agus', 'Dewi', 'Rizal', 'Ahmad', 'Nurul', 'Hafiz', 'Intan', 'Yusof'], l: ['Santoso', 'Wijaya', 'Hidayat', 'Pratama', 'Rahman', 'Ismail', 'Abdullah', 'Kusuma', 'Harun', 'Salleh'] },
  pacific: { f: ['Sione', 'Mele', 'Tavita', 'Losa', 'Peni', 'Iosefa', 'Mere', 'Kaveni'], l: ['Tuilagi', 'Fifita', 'Ratu', 'Vaka', 'Kautoga', 'Leota', 'Tamate', 'Waqa'] },
  east_af: { f: ['Abebe', 'Hana', 'Jomo', 'Wanjiru', 'Mohamed', 'Hodan', 'Yoweri', 'Grace', 'Dawit', 'Amina', 'Jean', 'Esther'], l: ['Tesfaye', 'Mwangi', 'Odhiambo', 'Warsame', 'Hassan', 'Mugisha', 'Bekele', 'Kiprono', 'Nkurunziza', 'Haile', 'Ochieng', 'Ali'] },
  south_af: { f: ['Thabo', 'Zanele', 'Tendai', 'Chipo', 'Lungile', 'Nomvula', 'Kagiso', 'Thandiwe'], l: ['Nkosi', 'Ndlovu', 'Moyo', 'Banda', 'Dlamini', 'Phiri', 'Mokoena', 'Chiwenga'] },
  west_af: { f: ['Kwame', 'Amara', 'Chidi', 'Ngozi', 'Fatou', 'Moussa', 'Kofi', 'Aminata', 'Ibrahim', 'Aisha', 'Ousmane', 'Mariama'], l: ['Okafor', 'Mensah', 'Diallo', 'Traoré', 'Kamara', 'Okonkwo', 'Sow', 'Abubakar', 'Keita', 'Coulibaly', 'Ouédraogo', 'Adeyemi'] },
};

export const GEN_NAME_PARTS = {
  prefix: ['Free', 'Democratic', "People's", 'Federal', 'United', 'Provisional', 'National', 'Popular', 'Sovereign', 'Autonomous'],
  form: ['Republic', 'State', 'Federation', 'Union', 'Commonwealth', 'Confederation', 'Territory'],
};
