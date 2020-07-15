import { getCustomRepository, getRepository } from 'typeorm';
import AppError from '../errors/AppError';

import TransactionsRepository from '../repositories/TransactionsRepository';

import Transaction from '../models/Transaction';
import Category from '../models/Category';

interface Request {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class CreateTransactionService {
  public async execute({
    title,
    value,
    type,
    category,
  }: Request): Promise<Transaction> {
    const transactionsRepository = getCustomRepository(TransactionsRepository);
    const categoryRepository = getRepository(Category);

    // Should not be able to create outcome transaction without a valid balance
    const { total } = await transactionsRepository.getBalance();
    if (type === 'outcome' && total < value) {
      throw new AppError("You don't have enough balance.");
    }

    // Verificar se a categoria já existe, se já existe busca no banco de dados, se não, criar ela.
    // É criada como let porque iremos sobrescrever seu valor caso não exista
    let transactionCategory = await categoryRepository.findOne({
      where: {
        title: category,
      },
    });

    // Se não existir cria a categoria
    if (!transactionCategory) {
      transactionCategory = categoryRepository.create({
        title: category,
      });

      await categoryRepository.save(transactionCategory);
    }

    const transaction = transactionsRepository.create({
      title,
      value,
      type,
      category: transactionCategory,
    });

    await transactionsRepository.save(transaction);

    return transaction;
  }
}

export default CreateTransactionService;
