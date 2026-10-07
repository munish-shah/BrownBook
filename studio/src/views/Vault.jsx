import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Coins, Gift, MagnifyingGlass, Plus, Sparkle, Storefront, Trash } from '@phosphor-icons/react';
import * as domain from '../domain.js';
import { AnimatedNumber } from '../components/ui.jsx';

export default function Vault({ data, act, openComposer, setDialog }) {
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('all');
    const dayKey = domain.todayKey();
    const sale = domain.isSaleActive(data);
    const balance = data.stats.currentBalance;

    const shop = useMemo(() => data.customShopItems
        .filter(item => !data.hiddenShopItems.includes(item.id))
        .map(item => ({ item, price: domain.shopPrice(data, item), full: domain.shopPrice(data, item, false) })), [data, dayKey]);
    const rewards = data.rewards;

    const categories = useMemo(() => ['all', ...new Set([...shop.map(entry => entry.item.category), ...rewards.map(reward => reward.category)].filter(Boolean))], [shop, rewards]);
    const needle = query.trim().toLowerCase();
    const matches = (name, cat) => (!needle || name.toLowerCase().includes(needle)) && (category === 'all' || cat === category);
    const byAffordability = (a, b) => (Number(a.cost <= balance) === Number(b.cost <= balance) ? a.cost - b.cost : Number(b.cost <= balance) - Number(a.cost <= balance));

    const shopRows = shop.filter(entry => matches(entry.item.name, entry.item.category)).map(entry => ({ ...entry, cost: entry.price })).sort(byAffordability);
    const rewardRows = rewards.filter(reward => matches(reward.name, reward.category)).map(reward => ({ reward, cost: reward.cost })).sort(byAffordability);
    const affordableCount = [...shopRows, ...rewardRows].filter(row => row.cost <= balance).length;

    return (
        <div className="vault">
            <section className="vault-hero">
                <div>
                    <p className="eyebrow">Reward vault</p>
                    <h1><Coins weight="fill" /> <AnimatedNumber value={balance} /></h1>
                    <p>{data.stats.totalCoinsEarned.toLocaleString()} earned lifetime · {data.stats.rewardsClaimed} rewards claimed · {affordableCount} you can afford now</p>
                </div>
                <button className="primary" onClick={openComposer}><Plus /> New reward</button>
            </section>

            {sale && <div className="sale"><Sparkle weight="fill" /> Sale active — daily shop is 50% off</div>}

            <div className="vault-tools">
                <label className="search"><MagnifyingGlass /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search rewards…" aria-label="Search rewards" /></label>
                <div className="chips">
                    {categories.map(name => <button key={name} className={category === name ? 'chip on' : 'chip'} onClick={() => setCategory(name)}>{name}</button>)}
                </div>
            </div>

            <h2 className="section-label"><Storefront /> Daily shop <span>prices reset at 6 AM</span></h2>
            <div className="shelf">
                {shopRows.map(({ item, price, full }) => (
                    <RewardCard
                        key={item.id}
                        name={item.name}
                        category={item.category || 'shop'}
                        price={price}
                        was={sale && full > price ? full : null}
                        note={item.scaling ? `${item.scalingType === 'multiply' ? '×' : '+'}${item.scaling} after each buy today` : 'Fixed price'}
                        balance={balance}
                        onClaim={() => setDialog({ type: 'claim', item, price })}
                        onDelete={() => act(draft => { draft.customShopItems = draft.customShopItems.filter(entry => entry.id !== item.id); }, `Removed ${item.name}`, { undo: true })}
                    />
                ))}
                {shopRows.length === 0 && <p className="quiet">{data.customShopItems.length ? 'Nothing matches.' : 'No shop items yet.'}</p>}
            </div>

            <h2 className="section-label"><Gift /> Rewards</h2>
            <div className="shelf">
                {rewardRows.map(({ reward }) => (
                    <RewardCard
                        key={reward.id}
                        name={reward.name}
                        category={reward.category}
                        price={reward.cost}
                        note={reward.description}
                        claimed={reward.timesClaimed}
                        balance={balance}
                        onClaim={() => setDialog({ type: 'claim', reward, price: reward.cost })}
                        onDelete={() => act(draft => { draft.rewards = draft.rewards.filter(entry => entry.id !== reward.id); }, `Deleted ${reward.name}`, { undo: true })}
                    />
                ))}
                {rewardRows.length === 0 && <p className="quiet">{rewards.length ? 'Nothing matches.' : 'No rewards yet.'}</p>}
            </div>
        </div>
    );
}

function RewardCard({ name, category, price, was, note, claimed, balance, onClaim, onDelete }) {
    const affordable = balance >= price;
    return (
        <motion.div layout className={affordable ? 'card' : 'card locked'}>
            <button className="ghost corner" onClick={onDelete} aria-label={`Delete ${name}`}><Trash /></button>
            <span className="cat">{category}</span>
            <b>{name}</b>
            <div className="price">{was && <s>{was}</s>}<Coins weight="fill" />{price}</div>
            {note && <small>{note}</small>}
            {claimed > 0 && <small>Claimed {claimed}×</small>}
            {!affordable && <div className="meter" aria-hidden="true"><i style={{ width: `${Math.min(100, (balance / price) * 100)}%` }} /></div>}
            <button className="claim" disabled={!affordable} onClick={onClaim}>{affordable ? 'Claim' : `Need ${price - balance} more`}</button>
        </motion.div>
    );
}
