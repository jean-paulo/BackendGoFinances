import { getCustomRepository, getRepository, In } from 'typeorm';
import csvParse from 'csv-parse';
import fs from 'fs';
import Transaction from '../models/Transaction';
import TransactionsRepository from '../repositories/TransactionsRepository';
import Category from '../models/Category';

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const transactionRepository = getCustomRepository(TransactionsRepository);
    const categoriesRepository = getRepository(Category);

    const contactsReadStream = fs.createReadStream(filePath);

    const parsers = csvParse({
      from_line: 2,
    });

    const parseCSV = contactsReadStream.pipe(parsers);

    const transactions: CSVTransaction[] = [];
    const categories: string[] = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value) return;

      categories.push(category);

      transactions.push({ title, type, value, category });
    });

    // espera pelo evento end do parseCSV.on
    await new Promise(resolve => parseCSV.on('end', resolve));

    // Depois da promise precisamos mapear as categorias no banco de dados
    // O Metodo in server para pesquisarmos todas categorias de uma vez
    const existentCategories = await categoriesRepository.find({
      where: {
        title: In(categories),
      },
    });

    // devolve só o titulo da categoria
    const existentCategoriesTitles = existentCategories.map(
      (category: Category) => category.title,
    );

    // Devolve as categorias que não existem no banco de dados e se tiver duplicados tira os duplicados
    const addCategoryTitles = categories
      .filter(category => !existentCategoriesTitles.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);

    const newCategories = categoriesRepository.create(
      addCategoryTitles.map(title => ({
        title,
      })),
    );

    // Insere no banco de dados
    await categoriesRepository.save(newCategories);

    const finalCategories = [...newCategories, ...existentCategories];

    const createdTransactions = transactionRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: finalCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionRepository.save(createdTransactions);

    // Apaga o arquivo
    await fs.promises.unlink(filePath);

    // Retorna todas as transações que foram criadas
    return createdTransactions;
  }
}

export default ImportTransactionsService;
