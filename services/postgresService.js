const { pgPool } = require('../config/db');

/**
 * Busca o token da API no banco de dados PostgreSQL.
 * @returns {Promise<string|null>} O token ou null se não encontrado.
 */
async function getApiToken() {
    // ATENÇÃO: Verifique se os nomes "Whatsapps", "token", "companyId" e "isDefault"
    // estão corretos e com as maiúsculas/minúsculas exatas do seu banco PG.
    const sqlToken = 'SELECT "token" FROM "Whatsapps" WHERE "companyId" = $1 AND "isDefault" = $2';
    const params = [9, true]; 
    
    try {
        const result = await pgPool.query(sqlToken, params);
        
        if (result.rows && result.rows.length > 0) {
            const token = result.rows[0].token; 
            return token;
        } else {
            console.error("Nenhum token padrão (CompanyID=9, IsDefault=true) encontrado no banco PostgreSQL.");
            return null;
        }
    } catch (err) {
        console.error("Erro ao executar a query do token no PostgreSQL:", err);
        throw new Error("Falha ao buscar token no DB PostgreSQL.");
    }
}

module.exports = {
    getApiToken
};
